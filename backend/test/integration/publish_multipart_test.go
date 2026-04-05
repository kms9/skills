package integration

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"testing"

	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublishAcceptsPayloadFieldAndFileParts(t *testing.T) {
	ts := NewTestServerWithAuthConfig(t, config.AuthConfig{
		JWTSecret:   "test-jwt-secret",
		FrontendURL: "http://localhost:10091",
	})
	ts.EnsureAuthSchema(t)
	ts.CleanupDatabase(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupDatabase(t)
	defer ts.CleanupAuthTables(t)

	user := model.User{
		Handle:       "publisher",
		DisplayName:  "Publisher",
		Email:        "publisher@example.com",
		Role:         "user",
		Status:       model.UserStatusActive,
		AuthProvider: "email",
	}
	require.NoError(t, ts.DB.Create(&user).Error)

	rawToken := "publish-cli-token"
	hash := sha256.Sum256([]byte(rawToken))
	apiToken := model.APIToken{
		UserID:    user.ID,
		Label:     "publish-test",
		TokenHash: hex.EncodeToString(hash[:]),
	}
	require.NoError(t, ts.DB.Create(&apiToken).Error)

	files := CreateTestSkillFiles()

	t.Run("accepts payload as form field", func(t *testing.T) {
		payload := model.PublishPayload{
			Slug:        "field-payload-skill",
			DisplayName: "Field Payload Skill",
			Version:     "1.0.0",
			Changelog:   "Initial release",
			Tags:        []string{"latest"},
		}

		resp := ts.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, files, rawToken, true)

		var body model.PublishResponse
		AssertJSONResponse(t, resp, 200, &body)
		assert.Equal(t, "true", body.OK)
		assert.NotEmpty(t, body.SkillID)
		assert.NotEmpty(t, body.VersionID)
	})

	t.Run("still accepts payload as file", func(t *testing.T) {
		payload := model.PublishPayload{
			Slug:        "file-payload-skill",
			DisplayName: "File Payload Skill",
			Version:     "1.0.0",
			Changelog:   "Initial release",
			Tags:        []string{"latest"},
		}

		resp := ts.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, files, rawToken, false)

		var body model.PublishResponse
		AssertJSONResponse(t, resp, 200, &body)
		assert.Equal(t, "true", body.OK)
		assert.NotEmpty(t, body.SkillID)
		assert.NotEmpty(t, body.VersionID)
	})

	t.Run("normalizes markdown content type from generic multipart uploads", func(t *testing.T) {
		payload := model.PublishPayload{
			Slug:        "markdown-content-type-skill",
			DisplayName: "Markdown Content Type Skill",
			Version:     "1.0.0",
			Changelog:   "Initial release",
			Tags:        []string{"latest"},
		}

		resp := ts.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, map[string]string{
			"SKILL.md": "# Skill\n",
		}, rawToken, true)

		var body model.PublishResponse
		AssertJSONResponse(t, resp, 200, &body)

		var version model.SkillVersion
		require.NoError(t, ts.DB.Where("id = ?", body.VersionID).First(&version).Error)
		require.Len(t, version.Files, 1)
		assert.Equal(t, "text/markdown", version.Files[0].ContentType)
	})

	t.Run("returns a stable conflict when the same user republishes the same version", func(t *testing.T) {
		payload := model.PublishPayload{
			Slug:        "duplicate-version-skill",
			DisplayName: "Duplicate Version Skill",
			Version:     "1.0.0",
			Changelog:   "Initial release",
			Tags:        []string{"latest"},
		}

		firstResp := ts.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, files, rawToken, true)
		AssertJSONResponse(t, firstResp, http.StatusOK, &model.PublishResponse{})

		secondResp := ts.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, files, rawToken, true)
		var conflictBody map[string]any
		AssertJSONResponse(t, secondResp, http.StatusConflict, &conflictBody)
		assert.Equal(t, "version_exists", conflictBody["code"])
		assert.Equal(t, "version already exists", conflictBody["error"])
	})

	t.Run("returns a stable forbidden response when another user owns the slug", func(t *testing.T) {
		otherUser := model.User{
			Handle:       "other-publisher",
			DisplayName:  "Other Publisher",
			Email:        "other-publisher@example.com",
			Role:         "user",
			Status:       model.UserStatusActive,
			AuthProvider: "email",
		}
		require.NoError(t, ts.DB.Create(&otherUser).Error)

		otherRawToken := "publish-cli-token-other"
		otherHash := sha256.Sum256([]byte(otherRawToken))
		otherAPIToken := model.APIToken{
			UserID:    otherUser.ID,
			Label:     "publish-test-other",
			TokenHash: hex.EncodeToString(otherHash[:]),
		}
		require.NoError(t, ts.DB.Create(&otherAPIToken).Error)

		payload := model.PublishPayload{
			Slug:        "owned-slug-skill",
			DisplayName: "Owned Slug Skill",
			Version:     "1.0.0",
			Changelog:   "Initial release",
			Tags:        []string{"latest"},
		}

		firstResp := ts.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, files, rawToken, true)
		AssertJSONResponse(t, firstResp, http.StatusOK, &model.PublishResponse{})

		conflictResp := ts.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, files, otherRawToken, true)
		var conflictBody map[string]any
		AssertJSONResponse(t, conflictResp, http.StatusForbidden, &conflictBody)
		assert.Equal(t, "skill_owned_by_another_user", conflictBody["code"])
		assert.Equal(t, "skill owned by another user", conflictBody["error"])
	})
}
