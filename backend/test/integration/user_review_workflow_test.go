package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func verifiedAtPtr() *time.Time {
	now := time.Now().UTC()
	return &now
}

func TestRegisterRequiresSMTP(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	body := bytes.NewBufferString(`{"email":"user@example.com","password":"password123","displayName":"User"}`)
	resp := ts.DoRequest(http.MethodPost, "/auth/register", body)
	assert.Equal(t, http.StatusServiceUnavailable, resp.Code)
	assert.JSONEq(t, `{"error":"email registration unavailable"}`, resp.Body.String())

	var count int64
	require.NoError(t, ts.DB.Model(&model.User{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestActivateMovesUserToReviewPending(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	code := "123456"
	expiresAt := time.Now().Add(10 * time.Minute)
	passwordHash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	require.NoError(t, err)

	user := model.User{
		Handle:              "pending-user",
		DisplayName:         "Pending User",
		Email:               "pending@example.com",
		PendingEmail:        "pending@example.com",
		PasswordHash:        string(passwordHash),
		Status:              model.UserStatusEmailPending,
		ActivationCode:      &code,
		ActivationExpiresAt: &expiresAt,
		AuthProvider:        "email",
	}
	require.NoError(t, ts.DB.Create(&user).Error)

	resp := ts.DoRequest(http.MethodPost, "/auth/activate", bytes.NewBufferString(`{"email":"pending@example.com","code":"123456"}`))
	assert.Equal(t, http.StatusOK, resp.Code)
	assert.JSONEq(t, `{"ok":"pending review","handle":"pending-user"}`, resp.Body.String())
	assert.NotContains(t, resp.Header().Get("Set-Cookie"), "clawhub_session=")

	var updated model.User
	require.NoError(t, ts.DB.First(&updated, "id = ?", user.ID).Error)
	assert.Equal(t, model.UserStatusReviewPending, updated.Status)
}

func TestSuperuserActivationSkipsReview(t *testing.T) {
	ts := NewTestServerWithAuthConfig(t, config.AuthConfig{
		JWTSecret:   "test-jwt-secret",
		FrontendURL: "http://localhost:10091",
	})
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	code := "123456"
	expiresAt := time.Now().Add(10 * time.Minute)
	passwordHash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	require.NoError(t, err)

	user := model.User{
		Handle:              "superuserlogo",
		DisplayName:         "Super User",
		Email:               "super@example.com",
		PendingEmail:        "super@example.com",
		PasswordHash:        string(passwordHash),
		Status:              model.UserStatusEmailPending,
		ActivationCode:      &code,
		ActivationExpiresAt: &expiresAt,
		AuthProvider:        "email",
	}
	require.NoError(t, ts.DB.Create(&user).Error)

	resp := ts.DoRequest(http.MethodPost, "/auth/activate", bytes.NewBufferString(`{"email":"super@example.com","code":"123456"}`))
	assert.Equal(t, http.StatusOK, resp.Code)
	assert.JSONEq(t, `{"ok":"pending review","handle":"superuserlogo"}`, resp.Body.String())
	assert.NotContains(t, resp.Header().Get("Set-Cookie"), "clawhub_session=")

	var updated model.User
	require.NoError(t, ts.DB.First(&updated, "id = ?", user.ID).Error)
	assert.Equal(t, model.UserStatusReviewPending, updated.Status)
}

func TestEmailLoginBlockedByReviewStatus(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	hash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	require.NoError(t, err)

	cases := []struct {
		name       string
		status     string
		wantStatus int
		wantBody   string
	}{
		{name: "email pending", status: model.UserStatusEmailPending, wantStatus: http.StatusForbidden, wantBody: `{"error":"account not activated"}`},
		{name: "review pending", status: model.UserStatusReviewPending, wantStatus: http.StatusForbidden, wantBody: `{"error":"account pending review"}`},
		{name: "rejected", status: model.UserStatusRejected, wantStatus: http.StatusForbidden, wantBody: `{"error":"account rejected"}`},
		{name: "disabled", status: model.UserStatusDisabled, wantStatus: http.StatusForbidden, wantBody: `{"error":"account disabled"}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, ts.DB.Exec("DELETE FROM users").Error)
			user := model.User{
				Handle:        "status-user",
				DisplayName:   "Status User",
				Email:         "status@example.com",
				PasswordHash:  string(hash),
				Status:        tc.status,
				AuthProvider:  "email",
				HasBoundEmail: tc.status != model.UserStatusEmailPending,
				EmailVerifiedAt: func() *time.Time {
					if tc.status == model.UserStatusEmailPending {
						return nil
					}
					return verifiedAtPtr()
				}(),
			}
			require.NoError(t, ts.DB.Create(&user).Error)

			resp := ts.DoRequest(http.MethodPost, "/auth/login", bytes.NewBufferString(`{"email":"status@example.com","password":"password123"}`))
			assert.Equal(t, tc.wantStatus, resp.Code)
			assert.JSONEq(t, tc.wantBody, resp.Body.String())
		})
	}
}

func TestAdminReviewEndpointsRequireSuperuserAndApprove(t *testing.T) {
	ts := NewTestServerWithAuthConfig(t, config.AuthConfig{
		JWTSecret:   "test-jwt-secret",
		FrontendURL: "http://localhost:10091",
		Superusers: config.SuperusersConfig{
			Providers: map[string]config.ProviderSuperuserConfig{
				"feishu": {
					Emails: []string{"super@example.com"},
				},
			},
		},
	})
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	super := model.User{
		Handle:       "superuserlogo",
		DisplayName:  "Super User",
		Email:        "super@example.com",
		Status:       model.UserStatusActive,
		AuthProvider: "feishu",
	}
	require.NoError(t, ts.DB.Create(&super).Error)
	require.NoError(t, ts.DB.Create(&model.AuthIdentity{
		UserID:           super.ID,
		Provider:         "feishu",
		ProviderSubject:  "ou-super",
		ProviderUsername: "superuserlogo",
		ProviderEmail:    "super@example.com",
		RawClaims:        "{}",
		LastLoginAt:      verifiedAtPtr(),
	}).Error)
	superToken, err := ts.AuthService.IssueJWT(&super)
	require.NoError(t, err)

	normal := model.User{
		Handle:       "normal-user",
		DisplayName:  "Normal User",
		Email:        "normal@example.com",
		Status:       model.UserStatusActive,
		AuthProvider: "gitlab",
	}
	require.NoError(t, ts.DB.Create(&normal).Error)
	normalToken, err := ts.AuthService.IssueJWT(&normal)
	require.NoError(t, err)

	pending := model.User{
		Handle:       "pending-user",
		DisplayName:  "Pending User",
		Email:        "pending@example.com",
		Status:       model.UserStatusReviewPending,
		AuthProvider: "github",
	}
	require.NoError(t, ts.DB.Create(&pending).Error)

	forbiddenResp := ts.DoAuthenticatedRequest(http.MethodGet, "/api/v1/admin/users", nil, normalToken)
	assert.Equal(t, http.StatusForbidden, forbiddenResp.Code)

	listResp := ts.DoAuthenticatedRequest(http.MethodGet, "/api/v1/admin/users?status=review_pending", nil, superToken)
	assert.Equal(t, http.StatusOK, listResp.Code)
	var listed struct {
		Items []struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"items"`
	}
	require.NoError(t, json.Unmarshal(listResp.Body.Bytes(), &listed))
	require.Len(t, listed.Items, 1)
	assert.Equal(t, pending.ID, listed.Items[0].ID)

	approveResp := ts.DoAuthenticatedRequest(http.MethodPost, "/api/v1/admin/users/"+pending.ID+"/approve", bytes.NewBufferString(`{}`), superToken)
	assert.Equal(t, http.StatusOK, approveResp.Code)
	var approved struct {
		Status     string  `json:"status"`
		ReviewedBy *string `json:"reviewedBy"`
	}
	require.NoError(t, json.Unmarshal(approveResp.Body.Bytes(), &approved))
	assert.Equal(t, model.UserStatusActive, approved.Status)
	require.NotNil(t, approved.ReviewedBy)
	assert.Equal(t, super.ID, *approved.ReviewedBy)
}

func TestOAuthFirstLoginRedirectsToPendingReview(t *testing.T) {
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

	resp := performGitLabCallback(ts)
	assert.Equal(t, http.StatusTemporaryRedirect, resp.Code)
	assert.Equal(t, "http://localhost:10091/auth/login?authError=account+pending+review", resp.Header().Get("Location"))
	assert.NotContains(t, resp.Header().Get("Set-Cookie"), "clawhub_session=")

	var user model.User
	require.NoError(t, ts.DB.Where("handle = ?", "gitlab-user").First(&user).Error)
	assert.Equal(t, model.UserStatusReviewPending, user.Status)
}

func TestOAuthSuperuserFirstLoginGetsSession(t *testing.T) {
	privateKey := generateGitLabSigningKey(t)
	gitlab := newMockGitLabOIDCServer(t, privateKey, mockGitLabOIDCOptions{})
	defer gitlab.Close()

	ts := NewTestServerWithAuthConfig(t, config.AuthConfig{
		JWTSecret:   "test-jwt-secret",
		FrontendURL: "http://localhost:10091",
		Superusers: config.SuperusersConfig{
			Providers: map[string]config.ProviderSuperuserConfig{
				"gitlab": {
					Emails: []string{"gitlab@example.com"},
				},
			},
		},
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

	resp := performGitLabCallback(ts)
	assert.Equal(t, http.StatusTemporaryRedirect, resp.Code)
	assert.Equal(t, "http://localhost:10091", resp.Header().Get("Location"))
	assert.Contains(t, strings.Join(resp.Header().Values("Set-Cookie"), "\n"), "clawhub_session=")

	var user model.User
	require.NoError(t, ts.DB.Where("handle = ?", "gitlab-user").First(&user).Error)
	assert.Equal(t, model.UserStatusActive, user.Status)
}
