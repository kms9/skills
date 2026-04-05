package integration

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGitLabCallbackCreatesPendingReviewIdentity(t *testing.T) {
	privateKey := generateGitLabSigningKey(t)
	gitlab := newMockGitLabOIDCServer(t, privateKey, mockGitLabOIDCOptions{})
	defer gitlab.Close()

	ts := NewTestServerWithAuthConfig(t, config.AuthConfig{
		JWTSecret:   "test-jwt-secret",
		FrontendURL: "http://localhost:10091",
		GitLab: config.GitLabProviderConfig{
			Enabled:      true,
			BaseURL:      gitlab.URL,
			ClientID:     "gitlab-client",
			ClientSecret: "gitlab-secret",
			Scopes:       []string{"openid", "profile", "email"},
		},
	})
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	req := httptest.NewRequest(http.MethodGet, "/auth/gitlab/callback?code=code-123&state=state-123", nil)
	req.Host = "localhost:10081"
	req.AddCookie(&http.Cookie{Name: "clawhub_oauth_state", Value: "state-123"})
	req.AddCookie(&http.Cookie{Name: "clawhub_oauth_provider", Value: "gitlab"})
	req.AddCookie(&http.Cookie{Name: "clawhub_oauth_nonce", Value: "nonce-123"})
	req.AddCookie(&http.Cookie{Name: "clawhub_oauth_redirect", Value: "/cli/auth?state=cli-state"})
	w := httptest.NewRecorder()

	ts.Router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusTemporaryRedirect, w.Code)
	assert.Equal(t, "http://localhost:10091/auth/login?authError=account+pending+review", w.Header().Get("Location"))
	assert.NotContains(t, strings.Join(w.Header().Values("Set-Cookie"), "\n"), "clawhub_session=")

	var user model.User
	require.NoError(t, ts.DB.Where("handle = ?", "gitlab-user").First(&user).Error)
	assert.Equal(t, "gitlab", user.AuthProvider)
	assert.Equal(t, "gitlab@example.com", user.Email)
	assert.Equal(t, model.UserStatusReviewPending, user.Status)

	var identity model.AuthIdentity
	require.NoError(t, ts.DB.Where("provider = ? AND provider_subject = ?", "gitlab", "gitlab-user-1").First(&identity).Error)
	assert.Equal(t, user.ID, identity.UserID)
	assert.Equal(t, "gitlab-user", identity.ProviderUsername)
	assert.NotNil(t, identity.LastLoginAt)
}

func TestGitLabCallbackReturnsTokenExchangeError(t *testing.T) {
	privateKey := generateGitLabSigningKey(t)
	gitlab := newMockGitLabOIDCServer(t, privateKey, mockGitLabOIDCOptions{
		tokenStatus: http.StatusBadGateway,
	})
	defer gitlab.Close()

	ts := NewTestServerWithAuthConfig(t, config.AuthConfig{
		JWTSecret:   "test-jwt-secret",
		FrontendURL: "http://localhost:10091",
		GitLab: config.GitLabProviderConfig{
			Enabled:      true,
			BaseURL:      gitlab.URL,
			ClientID:     "gitlab-client",
			ClientSecret: "gitlab-secret",
		},
	})
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	w := performGitLabCallback(ts)
	assert.Equal(t, http.StatusBadGateway, w.Code)
	assert.JSONEq(t, `{"error":"failed to exchange gitlab token"}`, w.Body.String())
	assert.NotContains(t, strings.Join(w.Header().Values("Set-Cookie"), "\n"), "clawhub_session=")

	var count int64
	require.NoError(t, ts.DB.Model(&model.User{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestGitLabCallbackReturnsClaimsReadError(t *testing.T) {
	privateKey := generateGitLabSigningKey(t)
	gitlab := newMockGitLabOIDCServer(t, privateKey, mockGitLabOIDCOptions{
		userinfoStatus: http.StatusBadGateway,
	})
	defer gitlab.Close()

	ts := NewTestServerWithAuthConfig(t, config.AuthConfig{
		JWTSecret:   "test-jwt-secret",
		FrontendURL: "http://localhost:10091",
		GitLab: config.GitLabProviderConfig{
			Enabled:      true,
			BaseURL:      gitlab.URL,
			ClientID:     "gitlab-client",
			ClientSecret: "gitlab-secret",
		},
	})
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	w := performGitLabCallback(ts)
	assert.Equal(t, http.StatusBadGateway, w.Code)
	assert.JSONEq(t, `{"error":"failed to read gitlab identity"}`, w.Body.String())
}

type mockGitLabOIDCOptions struct {
	tokenStatus    int
	userinfoStatus int
}

func performGitLabCallback(ts *TestServer) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/auth/gitlab/callback?code=code-123&state=state-123", nil)
	req.Host = "localhost:10081"
	req.AddCookie(&http.Cookie{Name: "clawhub_oauth_state", Value: "state-123"})
	req.AddCookie(&http.Cookie{Name: "clawhub_oauth_provider", Value: "gitlab"})
	req.AddCookie(&http.Cookie{Name: "clawhub_oauth_nonce", Value: "nonce-123"})
	w := httptest.NewRecorder()
	ts.Router.ServeHTTP(w, req)
	return w
}

func generateGitLabSigningKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return privateKey
}

func newMockGitLabOIDCServer(t *testing.T, privateKey *rsa.PrivateKey, opts mockGitLabOIDCOptions) *httptest.Server {
	t.Helper()

	var issuer string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			writeJSON(t, w, http.StatusOK, map[string]any{
				"issuer":                 issuer,
				"authorization_endpoint": issuer + "/oauth/authorize",
				"token_endpoint":         issuer + "/oauth/token",
				"userinfo_endpoint":      issuer + "/oauth/userinfo",
				"jwks_uri":               issuer + "/oauth/discovery/keys",
			})
		case "/oauth/token":
			if opts.tokenStatus != 0 {
				http.Error(w, "token exchange failed", opts.tokenStatus)
				return
			}
			idToken := signGitLabIDTokenForIntegration(t, privateKey, issuer, "gitlab-client", "nonce-123")
			writeJSON(t, w, http.StatusOK, map[string]any{
				"access_token": "access-123",
				"token_type":   "Bearer",
				"id_token":     idToken,
			})
		case "/oauth/userinfo":
			if got := r.Header.Get("Authorization"); got != "Bearer access-123" {
				http.Error(w, "missing auth", http.StatusUnauthorized)
				return
			}
			if opts.userinfoStatus != 0 {
				http.Error(w, "userinfo failed", opts.userinfoStatus)
				return
			}
			writeJSON(t, w, http.StatusOK, map[string]any{
				"sub":                "gitlab-user-1",
				"preferred_username": "gitlab-user",
				"name":               "GitLab User",
				"email":              "gitlab@example.com",
				"picture":            "https://gitlab.example.com/avatar.png",
				"email_verified":     true,
			})
		case "/oauth/discovery/keys":
			pub := privateKey.PublicKey
			writeJSON(t, w, http.StatusOK, map[string]any{
				"keys": []map[string]any{
					{
						"kty": "RSA",
						"kid": "kid-1",
						"alg": "RS256",
						"use": "sig",
						"n":   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
						"e":   base64.RawURLEncoding.EncodeToString([]byte{0x01, 0x00, 0x01}),
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	issuer = server.URL
	return server
}

func signGitLabIDTokenForIntegration(t *testing.T, privateKey *rsa.PrivateKey, issuer, audience, nonce string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":   issuer,
		"aud":   audience,
		"sub":   "gitlab-user-1",
		"nonce": nonce,
		"exp":   time.Now().Add(5 * time.Minute).Unix(),
		"iat":   time.Now().Unix(),
	})
	token.Header["kid"] = "kid-1"
	signed, err := token.SignedString(privateKey)
	require.NoError(t, err)
	return signed
}

func writeJSON(t *testing.T, w http.ResponseWriter, status int, payload map[string]any) {
	t.Helper()
	body, err := json.Marshal(payload)
	require.NoError(t, err)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, err = io.Copy(w, bytes.NewReader(body))
	require.NoError(t, err)
}
