package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/openclaw/clawhub/backend/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGitLabUserTokenLifecycle(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	user := model.User{
		Handle:       "gitlab-user",
		DisplayName:  "GitLab User",
		Email:        "gitlab@example.com",
		Role:         "user",
		Status:       "active",
		AuthProvider: "gitlab",
	}
	require.NoError(t, ts.DB.Create(&user).Error)

	now := time.Now().UTC()
	identity := model.AuthIdentity{
		UserID:           user.ID,
		Provider:         "gitlab",
		ProviderSubject:  "gitlab-user-1",
		ProviderUsername: "gitlab-user",
		ProviderEmail:    "gitlab@example.com",
		RawClaims:        "{}",
		LastLoginAt:      &now,
	}
	require.NoError(t, ts.DB.Create(&identity).Error)

	authService := service.NewAuthServiceWithConfig(ts.DB, config.AuthConfig{
		JWTSecret:   "test-jwt-secret",
		FrontendURL: "http://localhost:10091",
	})
	sessionToken, err := authService.IssueJWT(&user)
	require.NoError(t, err)

	createBody := bytes.NewBufferString(`{"label":"gitlab-cli"}`)
	createResp := ts.DoAuthenticatedRequest("POST", "/api/v1/users/me/tokens", createBody, sessionToken)
	AssertJSONResponse(t, createResp, 200, &struct {
		Token string `json:"token"`
		ID    string `json:"id"`
		Label string `json:"label"`
	}{})

	var created struct {
		Token string `json:"token"`
		ID    string `json:"id"`
		Label string `json:"label"`
	}
	require.NoError(t, json.Unmarshal(createResp.Body.Bytes(), &created))
	assert.NotEmpty(t, created.Token)
	assert.Equal(t, "gitlab-cli", created.Label)

	meResp := doBearerRequest(ts, "GET", "/api/v1/users/me", nil, created.Token)
	AssertJSONResponse(t, meResp, 200, &struct {
		ID     string `json:"id"`
		Handle string `json:"handle"`
	}{})
	var me struct {
		ID     string `json:"id"`
		Handle string `json:"handle"`
	}
	require.NoError(t, json.Unmarshal(meResp.Body.Bytes(), &me))
	assert.Equal(t, user.ID, me.ID)
	assert.Equal(t, user.Handle, me.Handle)

	listResp := ts.DoAuthenticatedRequest("GET", "/api/v1/users/me/tokens", nil, sessionToken)
	var listed struct {
		Tokens []struct {
			ID    string `json:"id"`
			Label string `json:"label"`
		} `json:"tokens"`
	}
	AssertJSONResponse(t, listResp, 200, &listed)
	require.Len(t, listed.Tokens, 1)
	assert.Equal(t, created.ID, listed.Tokens[0].ID)

	deleteResp := ts.DoAuthenticatedRequest("DELETE", "/api/v1/users/me/tokens/"+created.ID, nil, sessionToken)
	AssertJSONResponse(t, deleteResp, 200, &struct {
		OK string `json:"ok"`
	}{})

	listAfterDelete := ts.DoAuthenticatedRequest("GET", "/api/v1/users/me/tokens", nil, sessionToken)
	var listedAfterDelete struct {
		Tokens []struct {
			ID string `json:"id"`
		} `json:"tokens"`
	}
	AssertJSONResponse(t, listAfterDelete, 200, &listedAfterDelete)
	assert.Len(t, listedAfterDelete.Tokens, 0)

	meRespAfterDelete := doBearerRequest(ts, "GET", "/api/v1/users/me", nil, created.Token)
	assert.Equal(t, http.StatusUnauthorized, meRespAfterDelete.Code)
}

func doBearerRequest(ts *TestServer, method, path string, body *bytes.Buffer, token string) *httptest.ResponseRecorder {
	var reader *bytes.Buffer
	if body != nil {
		reader = body
	} else {
		reader = bytes.NewBuffer(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	ts.Router.ServeHTTP(w, req)
	return w
}
