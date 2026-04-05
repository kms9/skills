package integration

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSkillDetailIncludesLatestVersionFilesAndDownloadWorks(t *testing.T) {
	ts := NewTestServer(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	skillID := uuid.NewString()
	versionID := uuid.NewString()
	storageKey := "skills/test-skill/test-version/SKILL.md"
	fileContent := []byte("# SKILL\n\nhello")

	require.NoError(t, ts.StorageService.Upload(context.Background(), storageKey, bytes.NewReader(fileContent), "text/markdown"))

	skill := model.Skill{
		ID:               skillID,
		Slug:             "detail-fixture",
		DisplayName:      "Detail Fixture",
		ModerationStatus: "active",
		StatsVersions:    1,
		LatestVersionID:  &versionID,
	}
	require.NoError(t, ts.DB.Create(&skill).Error)

	version := model.SkillVersion{
		ID:        versionID,
		SkillID:   skillID,
		Version:   "1.2.3",
		Changelog: "fixture",
		Files: model.FileList{
			{
				Path:        "SKILL.md",
				Size:        int64(len(fileContent)),
				StorageKey:  storageKey,
				SHA256:      "fixture-sha",
				ContentType: "text/markdown",
			},
		},
		Parsed: json.RawMessage(`{"clawdis":{"os":["macos"]}}`),
	}
	require.NoError(t, ts.DB.Create(&version).Error)

	detailResp := ts.DoRequest(http.MethodGet, "/api/v1/skills/detail-fixture", nil)
	var detail model.SkillDetailResponse
	AssertJSONResponse(t, detailResp, http.StatusOK, &detail)
	require.NotNil(t, detail.LatestVersion)
	assert.Equal(t, "1.2.3", detail.LatestVersion.Version)
	require.Len(t, detail.LatestVersion.Files, 1)
	assert.Equal(t, "SKILL.md", detail.LatestVersion.Files[0].Path)
	assert.JSONEq(t, `{"clawdis":{"os":["macos"]}}`, string(detail.LatestVersion.Parsed))

	downloadResp := ts.DoRequest(http.MethodGet, "/api/v1/download?slug=detail-fixture&version=1.2.3", nil)
	assert.Equal(t, http.StatusOK, downloadResp.Code)
	assert.Equal(t, "application/zip", downloadResp.Header().Get("Content-Type"))

	reader, err := zip.NewReader(bytes.NewReader(downloadResp.Body.Bytes()), int64(downloadResp.Body.Len()))
	require.NoError(t, err)
	require.Len(t, reader.File, 2)
}

func TestSkillFileEndpointReturnsStoredText(t *testing.T) {
	ts := NewTestServer(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	skillID := uuid.NewString()
	versionID := uuid.NewString()
	storageKey := "skills/file-fixture/version/SKILL.md"
	fileContent := []byte("# SKILL\n\nhello world")

	require.NoError(
		t,
		ts.StorageService.Upload(context.Background(), storageKey, bytes.NewReader(fileContent), "text/markdown"),
	)

	skill := model.Skill{
		ID:               skillID,
		Slug:             "file-fixture",
		DisplayName:      "File Fixture",
		ModerationStatus: "active",
		StatsVersions:    1,
		LatestVersionID:  &versionID,
	}
	require.NoError(t, ts.DB.Create(&skill).Error)

	version := model.SkillVersion{
		ID:        versionID,
		SkillID:   skillID,
		Version:   "0.0.1",
		Changelog: "fixture",
		Files: model.FileList{
			{
				Path:        "SKILL.md",
				Size:        int64(len(fileContent)),
				StorageKey:  storageKey,
				SHA256:      "fixture-sha",
				ContentType: "text/markdown",
			},
		},
	}
	require.NoError(t, ts.DB.Create(&version).Error)

	resp := ts.DoRequest(http.MethodGet, "/api/v1/skills/file-fixture/file?path=SKILL.md&version=0.0.1", nil)
	assert.Equal(t, http.StatusOK, resp.Code)
	assert.Equal(t, "text/markdown; charset=utf-8", resp.Header().Get("Content-Type"))
	assert.Equal(t, string(fileContent), resp.Body.String())
}

func TestSkillFileEndpointNormalizesGenericBinaryContentTypeForMarkdown(t *testing.T) {
	ts := NewTestServer(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	skillID := uuid.NewString()
	versionID := uuid.NewString()
	storageKey := "skills/file-fixture/version-octet/SKILL.md"
	fileContent := []byte("# SKILL\n\nhello world")

	require.NoError(
		t,
		ts.StorageService.Upload(context.Background(), storageKey, bytes.NewReader(fileContent), "application/octet-stream"),
	)

	skill := model.Skill{
		ID:               skillID,
		Slug:             "file-fixture-octet",
		DisplayName:      "File Fixture Octet",
		ModerationStatus: "active",
		StatsVersions:    1,
		LatestVersionID:  &versionID,
	}
	require.NoError(t, ts.DB.Create(&skill).Error)

	version := model.SkillVersion{
		ID:        versionID,
		SkillID:   skillID,
		Version:   "0.0.1",
		Changelog: "fixture",
		Files: model.FileList{
			{
				Path:        "SKILL.md",
				Size:        int64(len(fileContent)),
				StorageKey:  storageKey,
				SHA256:      "fixture-sha",
				ContentType: "application/octet-stream",
			},
		},
	}
	require.NoError(t, ts.DB.Create(&version).Error)

	resp := ts.DoRequest(http.MethodGet, "/api/v1/skills/file-fixture-octet/file?path=SKILL.md&version=0.0.1", nil)
	assert.Equal(t, http.StatusOK, resp.Code)
	assert.Equal(t, "text/markdown; charset=utf-8", resp.Header().Get("Content-Type"))
	assert.Equal(t, string(fileContent), resp.Body.String())
}

func TestSkillCommentsCreateAndList(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureAuthSchema(t)
	ts.CleanupDatabase(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupDatabase(t)
	defer ts.CleanupAuthTables(t)

	require.NoError(t, ts.DB.Exec(`
		CREATE TABLE IF NOT EXISTS skill_comments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			body TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`).Error)

	user := model.User{
		Handle:       "commenter",
		DisplayName:  "Commenter",
		Email:        "commenter@example.com",
		Role:         "user",
		Status:       model.UserStatusActive,
		AuthProvider: "email",
	}
	require.NoError(t, ts.DB.Create(&user).Error)
	token, err := ts.AuthService.IssueJWT(&user)
	require.NoError(t, err)

	skill := model.Skill{
		ID:               uuid.NewString(),
		Slug:             "comment-fixture",
		DisplayName:      "Comment Fixture",
		ModerationStatus: "active",
		StatsVersions:    1,
	}
	require.NoError(t, ts.DB.Create(&skill).Error)

	createResp := ts.DoAuthenticatedRequest(
		http.MethodPost,
		"/api/v1/skills/comment-fixture/comments",
		bytes.NewBufferString(`{"body":"hello comment"}`),
		token,
	)
	AssertJSONResponse(t, createResp, http.StatusOK, &map[string]any{})

	listResp := ts.DoRequest(http.MethodGet, "/api/v1/skills/comment-fixture/comments", nil)
	var listBody struct {
		Items []struct {
			Body string `json:"body"`
			User struct {
				Handle string `json:"handle"`
			} `json:"user"`
		} `json:"items"`
	}
	AssertJSONResponse(t, listResp, http.StatusOK, &listBody)
	require.Len(t, listBody.Items, 1)
	assert.Equal(t, "hello comment", listBody.Items[0].Body)
	assert.Equal(t, "commenter", listBody.Items[0].User.Handle)
}
