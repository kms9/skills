package integration

import (
	"fmt"
	"testing"

	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestCompleteSkillLifecycle tests the entire skill lifecycle
func TestCompleteSkillLifecycle(t *testing.T) {
	server := NewTestServer(t)
	server.EnsureAuthSchema(t)
	server.CleanupAuthTables(t)
	defer server.CleanupDatabase(t)
	defer server.CleanupAuthTables(t)

	user := model.User{
		Handle:       "lifecycle-user",
		DisplayName:  "Lifecycle User",
		Email:        "lifecycle@example.com",
		Role:         "user",
		Status:       model.UserStatusActive,
		AuthProvider: "gitlab",
	}
	require.NoError(t, server.DB.Create(&user).Error)
	rawToken := createRawAPIToken(t, server, user.ID, "lifecycle")

	t.Run("1. Health Check", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/health", nil)

		var response map[string]string
		AssertJSONResponse(t, w, 200, &response)
		assert.Equal(t, "ok", response["status"])

		t.Log("✓ Health check passed")
	})

	t.Run("2. Well-Known Endpoint", func(t *testing.T) {
		w := server.DoRequest("GET", "/.well-known/clawhub.json", nil)

		var response map[string]interface{}
		AssertJSONResponse(t, w, 200, &response)
		assert.Contains(t, response, "apiBase")
		assert.Contains(t, response, "minCliVersion")

		t.Log("✓ Well-known endpoint working")
	})

	t.Run("3. List Empty Skills", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/skills", nil)

		var response model.SkillListResponse
		AssertJSONResponse(t, w, 200, &response)
		assert.Empty(t, response.Items)
		assert.Nil(t, response.NextCursor)

		t.Log("✓ Empty skills list returned")
	})

	t.Run("4. Search Empty Database", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/search?q=test", nil)

		var response model.SearchResponse
		AssertJSONResponse(t, w, 200, &response)
		assert.Empty(t, response.Results)

		t.Log("✓ Empty search results returned")
	})

	t.Run("5. Publish New Skill", func(t *testing.T) {
		payload := model.PublishPayload{
			Slug:        "test-skill",
			DisplayName: "Test Skill",
			Version:     "1.0.0",
			Changelog:   "Initial release",
			Tags:        []string{"test", "example"},
		}

		files := CreateTestSkillFiles()
		w := server.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, files, rawToken, false)

		// Debug: print response if not 200
		if w.Code != 200 {
			t.Logf("Publish failed with status %d: %s", w.Code, w.Body.String())
		}

		var response model.PublishResponse
		AssertJSONResponse(t, w, 200, &response)
		assert.Equal(t, "true", response.OK)
		assert.NotEmpty(t, response.SkillID)
		assert.NotEmpty(t, response.VersionID)

		// Store for potential future use
		_ = payload.Slug       // publishedSkillSlug
		_ = response.VersionID // publishedVersionID

		t.Logf("✓ Skill published: %s (version: %s)", response.SkillID, response.VersionID)
	})

	t.Run("6. List Skills After Publish", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/skills", nil)

		var response model.SkillListResponse
		AssertJSONResponse(t, w, 200, &response)
		require.Len(t, response.Items, 1)

		skill := response.Items[0]
		assert.Equal(t, "test-skill", skill.Slug)
		assert.Equal(t, "Test Skill", skill.DisplayName)
		assert.Equal(t, int64(0), skill.Stats.Downloads)
		assert.Equal(t, 1, skill.Stats.Versions)

		t.Log("✓ Skill appears in list")
	})

	t.Run("7. Get Skill Detail", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/skills/test-skill", nil)

		var response model.SkillDetailResponse
		AssertJSONResponse(t, w, 200, &response)
		assert.Equal(t, "test-skill", response.Skill.Slug)
		assert.Equal(t, "Test Skill", response.Skill.DisplayName)
		require.NotNil(t, response.LatestVersion)
		assert.Equal(t, "1.0.0", response.LatestVersion.Version)
		require.Len(t, response.LatestVersion.Files, 2)

		t.Log("✓ Skill detail retrieved")
	})

	t.Run("8. Get Skill Versions", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/skills/test-skill/versions", nil)

		var response model.VersionListResponse
		AssertJSONResponse(t, w, 200, &response)
		require.Len(t, response.Items, 1)
		assert.Equal(t, "1.0.0", response.Items[0].Version)
		assert.Equal(t, "Initial release", response.Items[0].Changelog)

		t.Log("✓ Version history retrieved")
	})

	t.Run("9. Search for Published Skill", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/search?q=test", nil)

		var response model.SearchResponse
		AssertJSONResponse(t, w, 200, &response)
		require.NotEmpty(t, response.Results)

		found := false
		for _, result := range response.Results {
			if result.Slug == "test-skill" {
				found = true
				assert.Equal(t, "Test Skill", result.DisplayName)
				assert.Greater(t, result.Score, 0.0)
				break
			}
		}
		assert.True(t, found, "Published skill should appear in search results")

		t.Log("✓ Skill found in search")
	})

	t.Run("10. Download Skill ZIP", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/download?slug=test-skill", nil)

		assert.Equal(t, 200, w.Code)
		assert.Equal(t, "application/zip", w.Header().Get("Content-Type"))
		assert.Contains(t, w.Header().Get("Content-Disposition"), "test-skill-1.0.0.zip")
		assert.Greater(t, w.Body.Len(), 0, "ZIP file should not be empty")

		t.Logf("✓ ZIP downloaded (%d bytes)", w.Body.Len())
	})

	t.Run("11. Publish Second Version", func(t *testing.T) {
		payload := model.PublishPayload{
			Slug:        "test-skill",
			DisplayName: "Test Skill",
			Version:     "1.1.0",
			Changelog:   "Added new features",
			Tags:        []string{"test", "example", "updated"},
		}

		files := CreateTestSkillFiles()
		files["README.md"] = "# Updated README\n\nThis is version 1.1.0"

		w := server.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, files, rawToken, false)

		var response model.PublishResponse
		AssertJSONResponse(t, w, 200, &response)
		assert.Equal(t, "true", response.OK)

		t.Log("✓ Second version published")
	})

	t.Run("12. Verify Version Count", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/skills/test-skill/versions", nil)

		var response model.VersionListResponse
		AssertJSONResponse(t, w, 200, &response)
		require.Len(t, response.Items, 2)

		// Versions should be sorted by created_at DESC
		assert.Equal(t, "1.1.0", response.Items[0].Version)
		assert.Equal(t, "1.0.0", response.Items[1].Version)

		t.Log("✓ Both versions present")
	})

	t.Run("13. Version Resolution", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/resolve?slug=test-skill", nil)

		var response model.ResolveResponse
		AssertJSONResponse(t, w, 200, &response)

		if response.LatestVersion != nil {
			assert.Equal(t, "1.1.0", response.LatestVersion.Version)
		}

		t.Log("✓ Version resolution working")
	})

	t.Run("14. Delete Skill (Soft Delete)", func(t *testing.T) {
		w := doBearerRequest(server, "DELETE", "/api/v1/skills/test-skill", nil, rawToken)

		var response map[string]string
		AssertJSONResponse(t, w, 200, &response)
		assert.Equal(t, "true", response["ok"])

		t.Log("✓ Skill soft deleted")
	})

	t.Run("15. Verify Deleted Skill Not in List", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/skills", nil)

		var response model.SkillListResponse
		AssertJSONResponse(t, w, 200, &response)
		assert.Empty(t, response.Items, "Deleted skill should not appear in list")

		t.Log("✓ Deleted skill hidden from list")
	})

	t.Run("16. Verify Deleted Skill Not in Search", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/search?q=test", nil)

		var response model.SearchResponse
		AssertJSONResponse(t, w, 200, &response)

		for _, result := range response.Results {
			assert.NotEqual(t, "test-skill", result.Slug, "Deleted skill should not appear in search")
		}

		t.Log("✓ Deleted skill hidden from search")
	})

	t.Run("17. Undelete Skill", func(t *testing.T) {
		w := doBearerRequest(server, "POST", "/api/v1/skills/test-skill/undelete", nil, rawToken)

		var response map[string]string
		AssertJSONResponse(t, w, 200, &response)
		assert.Equal(t, "true", response["ok"])

		t.Log("✓ Skill restored")
	})

	t.Run("18. Verify Restored Skill in List", func(t *testing.T) {
		w := server.DoRequest("GET", "/api/v1/skills", nil)

		var response model.SkillListResponse
		AssertJSONResponse(t, w, 200, &response)
		require.Len(t, response.Items, 1)
		assert.Equal(t, "test-skill", response.Items[0].Slug)

		t.Log("✓ Restored skill appears in list")
	})

	t.Run("19. Test Pagination", func(t *testing.T) {
		// Publish more skills to test pagination
		for i := 2; i <= 5; i++ {
			payload := model.PublishPayload{
				Slug:        fmt.Sprintf("test-skill-%d", i),
				DisplayName: fmt.Sprintf("Test Skill %d", i),
				Version:     "1.0.0",
				Changelog:   "Initial release",
				Tags:        []string{"test"},
			}

			files := CreateTestSkillFiles()
			w := server.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, files, rawToken, false)
			require.Equal(t, 200, w.Code)
		}

		// Test with limit
		w := server.DoRequest("GET", "/api/v1/skills?limit=3", nil)

		var response model.SkillListResponse
		AssertJSONResponse(t, w, 200, &response)
		assert.Len(t, response.Items, 3)
		assert.NotNil(t, response.NextCursor, "Should have next cursor")

		t.Log("✓ Pagination working")
	})

	t.Run("20. Test Error Cases", func(t *testing.T) {
		// Non-existent skill
		w := server.DoRequest("GET", "/api/v1/skills/non-existent", nil)
		assert.Equal(t, 404, w.Code)

		// Invalid publish (missing required fields)
		payload := model.PublishPayload{
			Slug: "invalid",
			// Missing DisplayName and Version
		}
		w = server.DoBearerMultipartRequest("POST", "/api/v1/skills", payload, nil, rawToken, false)
		assert.NotEqual(t, 200, w.Code)

		// Search without query
		w = server.DoRequest("GET", "/api/v1/search", nil)
		assert.Equal(t, 400, w.Code)

		t.Log("✓ Error handling working")
	})
}
