package integration

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWhoamiCompatibilityWithBearerToken(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	user := model.User{
		Handle:       "compat-user",
		DisplayName:  "Compat User",
		Email:        "compat@example.com",
		Role:         "user",
		Status:       model.UserStatusActive,
		AuthProvider: "gitlab",
		AvatarURL:    "https://example.com/avatar.png",
	}
	require.NoError(t, ts.DB.Create(&user).Error)

	rawToken := createRawAPIToken(t, ts, user.ID, "whoami")

	resp := doBearerRequest(ts, http.MethodGet, "/api/v1/whoami", nil, rawToken)
	var body struct {
		User struct {
			Handle      *string `json:"handle"`
			DisplayName *string `json:"displayName"`
			Image       *string `json:"image"`
		} `json:"user"`
	}
	AssertJSONResponse(t, resp, http.StatusOK, &body)
	require.NotNil(t, body.User.Handle)
	assert.Equal(t, "compat-user", *body.User.Handle)
	require.NotNil(t, body.User.DisplayName)
	assert.Equal(t, "Compat User", *body.User.DisplayName)
	require.NotNil(t, body.User.Image)
	assert.Equal(t, "https://example.com/avatar.png", *body.User.Image)

	unauthorized := ts.DoRequest(http.MethodGet, "/api/v1/whoami", nil)
	assert.Equal(t, http.StatusUnauthorized, unauthorized.Code)
}

func TestStarAndUnstarCompatibilityRoutes(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureAuthSchema(t)
	ts.CleanupDatabase(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupDatabase(t)
	defer ts.CleanupAuthTables(t)

	user := model.User{
		Handle:       "starrer",
		DisplayName:  "Starrer",
		Email:        "starrer@example.com",
		Role:         "user",
		Status:       model.UserStatusActive,
		AuthProvider: "gitlab",
	}
	require.NoError(t, ts.DB.Create(&user).Error)

	skill := model.Skill{
		ID:               uuid.NewString(),
		Slug:             "compat-star-skill",
		DisplayName:      "Compat Star Skill",
		ModerationStatus: "active",
	}
	require.NoError(t, ts.DB.Create(&skill).Error)

	rawToken := createRawAPIToken(t, ts, user.ID, "star")

	firstStar := doBearerRequest(ts, http.MethodPost, "/api/v1/stars/compat-star-skill", nil, rawToken)
	var starBody struct {
		OK             string `json:"ok"`
		Starred        bool   `json:"starred"`
		AlreadyStarred bool   `json:"alreadyStarred"`
	}
	AssertJSONResponse(t, firstStar, http.StatusOK, &starBody)
	assert.Equal(t, "true", starBody.OK)
	assert.True(t, starBody.Starred)
	assert.False(t, starBody.AlreadyStarred)

	secondStar := doBearerRequest(ts, http.MethodPost, "/api/v1/stars/compat-star-skill", nil, rawToken)
	AssertJSONResponse(t, secondStar, http.StatusOK, &starBody)
	assert.True(t, starBody.AlreadyStarred)

	frontendStarPath := doBearerRequest(ts, http.MethodDelete, "/api/v1/skills/compat-star-skill/star", nil, rawToken)
	var unstarBody struct {
		OK               string `json:"ok"`
		Unstarred        bool   `json:"unstarred"`
		AlreadyUnstarred bool   `json:"alreadyUnstarred"`
	}
	AssertJSONResponse(t, frontendStarPath, http.StatusOK, &unstarBody)
	assert.Equal(t, "true", unstarBody.OK)
	assert.True(t, unstarBody.Unstarred)
	assert.False(t, unstarBody.AlreadyUnstarred)

	secondUnstar := doBearerRequest(ts, http.MethodDelete, "/api/v1/stars/compat-star-skill", nil, rawToken)
	AssertJSONResponse(t, secondUnstar, http.StatusOK, &unstarBody)
	assert.True(t, unstarBody.AlreadyUnstarred)
}

func TestResolveCompatibilityResponses(t *testing.T) {
	ts := NewTestServer(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	skillID := uuid.NewString()
	v1ID := uuid.NewString()
	v2ID := uuid.NewString()
	require.NoError(t, ts.DB.Create(&model.Skill{
		ID:               skillID,
		Slug:             "resolve-fixture",
		DisplayName:      "Resolve Fixture",
		ModerationStatus: "active",
		StatsVersions:    2,
		LatestVersionID:  &v2ID,
	}).Error)
	require.NoError(t, ts.DB.Create(&model.SkillVersion{
		ID:          v1ID,
		SkillID:     skillID,
		Version:     "1.0.0",
		Changelog:   "first",
		ContentHash: "hash-v1",
		Files:       model.FileList{},
	}).Error)
	require.NoError(t, ts.DB.Create(&model.SkillVersion{
		ID:          v2ID,
		SkillID:     skillID,
		Version:     "1.1.0",
		Changelog:   "second",
		ContentHash: "hash-v2",
		Files:       model.FileList{},
	}).Error)

	matchResp := ts.DoRequest(http.MethodGet, "/api/v1/resolve?slug=resolve-fixture&hash=hash-v1", nil)
	var matchBody model.ResolveResponse
	AssertJSONResponse(t, matchResp, http.StatusOK, &matchBody)
	require.NotNil(t, matchBody.Match)
	assert.Equal(t, "1.0.0", matchBody.Match.Version)
	require.NotNil(t, matchBody.LatestVersion)
	assert.Equal(t, "1.1.0", matchBody.LatestVersion.Version)

	missResp := ts.DoRequest(http.MethodGet, "/api/v1/resolve?slug=resolve-fixture&hash=nope", nil)
	var missBody model.ResolveResponse
	AssertJSONResponse(t, missResp, http.StatusOK, &missBody)
	assert.Nil(t, missBody.Match)
	require.NotNil(t, missBody.LatestVersion)
	assert.Equal(t, "1.1.0", missBody.LatestVersion.Version)

	notFound := ts.DoRequest(http.MethodGet, "/api/v1/resolve?slug=missing-skill&hash=nope", nil)
	assert.Equal(t, http.StatusNotFound, notFound.Code)
	assert.JSONEq(t, `{"error":"skill not found"}`, notFound.Body.String())
}

func createRawAPIToken(t *testing.T, ts *TestServer, userID string, label string) string {
	t.Helper()

	rawToken := "raw-token-" + label
	hash := sha256.Sum256([]byte(rawToken))
	apiToken := model.APIToken{
		UserID:    userID,
		Label:     label,
		TokenHash: hex.EncodeToString(hash[:]),
	}
	require.NoError(t, ts.DB.Create(&apiToken).Error)
	return rawToken
}
