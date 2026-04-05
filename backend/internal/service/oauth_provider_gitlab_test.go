package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/openclaw/clawhub/backend/internal/config"
)

func TestGitLabOIDCProviderFetchIdentity(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}

	const issuer = "https://gitlab.example.com"
	provider, err := NewGitLabOIDCProvider(config.GitLabProviderConfig{
		Enabled:       true,
		BaseURL:       issuer,
		ClientID:      "gitlab-client",
		ClientSecret:  "gitlab-secret",
		Scopes:        []string{"openid", "profile", "email"},
		AllowedGroups: []string{"platform/clawhub"},
	})
	if err != nil {
		t.Fatalf("NewGitLabOIDCProvider() error = %v", err)
	}

	provider.client = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.String() {
			case issuer + "/.well-known/openid-configuration":
				return jsonResponse(map[string]any{
					"issuer":                 issuer,
					"authorization_endpoint": issuer + "/oauth/authorize",
					"token_endpoint":         issuer + "/oauth/token",
					"userinfo_endpoint":      issuer + "/oauth/userinfo",
					"jwks_uri":               issuer + "/oauth/discovery/keys",
				}), nil
			case issuer + "/oauth/token":
				idToken := signGitLabIDToken(t, privateKey, issuer, "gitlab-client", "nonce-123")
				return jsonResponse(map[string]any{
					"access_token": "access-123",
					"token_type":   "Bearer",
					"id_token":     idToken,
				}), nil
			case issuer + "/oauth/userinfo":
				if got := req.Header.Get("Authorization"); got != "Bearer access-123" {
					t.Fatalf("unexpected Authorization header: %s", got)
				}
				return jsonResponse(map[string]any{
					"sub":                "gitlab-user-1",
					"preferred_username": "gitlab-user",
					"name":               "GitLab User",
					"email":              "gitlab@example.com",
					"picture":            "https://gitlab.example.com/avatar.png",
					"email_verified":     true,
					"groups":             []string{"platform/clawhub"},
				}), nil
			case issuer + "/oauth/discovery/keys":
				pub := privateKey.PublicKey
				return jsonResponse(map[string]any{
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
				}), nil
			default:
				return nil, fmt.Errorf("unexpected URL: %s", req.URL.String())
			}
		}),
	}

	tokenSet, err := provider.ExchangeCode(context.Background(), ExchangeCodeInput{
		Code:        "code-123",
		RedirectURI: "http://localhost:10081/auth/gitlab/callback",
	})
	if err != nil {
		t.Fatalf("ExchangeCode() error = %v", err)
	}

	identity, err := provider.FetchIdentity(context.Background(), tokenSet, "nonce-123")
	if err != nil {
		t.Fatalf("FetchIdentity() error = %v", err)
	}

	if identity.Provider != "gitlab" || identity.Subject != "gitlab-user-1" {
		t.Fatalf("unexpected identity: %#v", identity)
	}
	if identity.Username != "gitlab-user" || identity.Email != "gitlab@example.com" {
		t.Fatalf("unexpected identity fields: %#v", identity)
	}
}

func TestGitLabOIDCProviderRejectsUnexpectedGroup(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}

	const issuer = "https://gitlab.example.com"
	provider, err := NewGitLabOIDCProvider(config.GitLabProviderConfig{
		Enabled:       true,
		BaseURL:       issuer,
		ClientID:      "gitlab-client",
		ClientSecret:  "gitlab-secret",
		AllowedGroups: []string{"platform/clawhub"},
	})
	if err != nil {
		t.Fatalf("NewGitLabOIDCProvider() error = %v", err)
	}

	provider.client = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.String() {
			case issuer + "/.well-known/openid-configuration":
				return jsonResponse(map[string]any{
					"issuer":                 issuer,
					"authorization_endpoint": issuer + "/oauth/authorize",
					"token_endpoint":         issuer + "/oauth/token",
					"userinfo_endpoint":      issuer + "/oauth/userinfo",
					"jwks_uri":               issuer + "/oauth/discovery/keys",
				}), nil
			case issuer + "/oauth/token":
				idToken := signGitLabIDToken(t, privateKey, issuer, "gitlab-client", "nonce-123")
				return jsonResponse(map[string]any{
					"access_token": "access-123",
					"token_type":   "Bearer",
					"id_token":     idToken,
				}), nil
			case issuer + "/oauth/userinfo":
				return jsonResponse(map[string]any{
					"sub":                "gitlab-user-1",
					"preferred_username": "gitlab-user",
					"name":               "GitLab User",
					"email":              "gitlab@example.com",
					"groups":             []string{"other/group"},
				}), nil
			case issuer + "/oauth/discovery/keys":
				pub := privateKey.PublicKey
				return jsonResponse(map[string]any{
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
				}), nil
			default:
				return nil, fmt.Errorf("unexpected URL: %s", req.URL.String())
			}
		}),
	}

	tokenSet, err := provider.ExchangeCode(context.Background(), ExchangeCodeInput{
		Code:        "code-123",
		RedirectURI: "http://localhost:10081/auth/gitlab/callback",
	})
	if err != nil {
		t.Fatalf("ExchangeCode() error = %v", err)
	}

	_, err = provider.FetchIdentity(context.Background(), tokenSet, "nonce-123")
	if err == nil || err.Error() != "gitlab user is not in an allowed group" {
		t.Fatalf("expected allowed group error, got %v", err)
	}
}

func TestGitLabOIDCProviderBuildAuthURL(t *testing.T) {
	provider, err := NewGitLabOIDCProvider(config.GitLabProviderConfig{
		Enabled:      true,
		BaseURL:      "https://gitlab.example.com",
		ClientID:     "gitlab-client",
		ClientSecret: "gitlab-secret",
	})
	if err != nil {
		t.Fatalf("NewGitLabOIDCProvider() error = %v", err)
	}
	provider.discovery = &gitLabDiscovery{
		AuthorizationEndpoint: "https://gitlab.example.com/oauth/authorize",
	}

	authURL, err := provider.BuildAuthURL(AuthRequestInput{
		RedirectURI: "http://localhost:10081/auth/gitlab/callback",
		State:       "state-123",
		Nonce:       "nonce-123",
	})
	if err != nil {
		t.Fatalf("BuildAuthURL() error = %v", err)
	}
	if !strings.Contains(authURL, "nonce=nonce-123") || !strings.Contains(authURL, "state=state-123") {
		t.Fatalf("unexpected authURL: %s", authURL)
	}
}

func signGitLabIDToken(t *testing.T, privateKey *rsa.PrivateKey, issuer, audience, nonce string) string {
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
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}
	return signed
}

type roundTripFunc func(req *http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func jsonResponse(payload map[string]any) *http.Response {
	body, _ := json.Marshal(payload)
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(bytes.NewReader(body)),
	}
}
