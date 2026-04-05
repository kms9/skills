package integration

import (
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSearchReturnsEmptyArrayInsteadOfNull(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureSkillSchema(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	resp := ts.DoRequest(http.MethodGet, "/api/v1/search?q=missing-skill", nil)

	assert.Equal(t, http.StatusOK, resp.Code)
	assert.JSONEq(t, `{"results":[]}`, resp.Body.String())
}

func TestSearchMatchesSlugWhenDisplayNameDoesNotContainQuery(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureSkillSchema(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	now := time.Now().UTC()
	skill := model.Skill{
		ID:               uuid.NewString(),
		Slug:             "daily-paper",
		DisplayName:      "每日论文",
		Description:      "",
		Tags:             pq.StringArray{"latest"},
		ModerationStatus: "active",
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	require.NoError(t, ts.DB.Create(&skill).Error)

	resp := ts.DoRequest(http.MethodGet, "/api/v1/search?q=daily", nil)

	var body model.SearchResponse
	AssertJSONResponse(t, resp, http.StatusOK, &body)
	require.Len(t, body.Results, 1)
	assert.Equal(t, "daily-paper", body.Results[0].Slug)
	assert.Equal(t, "每日论文", body.Results[0].DisplayName)
	assert.Greater(t, body.Results[0].Score, 0.0)
}

func TestSearchMatchesDisplayNameDescriptionTagsAndSlug(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureSkillSchema(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	now := time.Now().UTC()
	skill := model.Skill{
		ID:               uuid.NewString(),
		Slug:             "daily-paper",
		DisplayName:      "每日论文",
		Description:      "精选AI论文摘要",
		Tags:             pq.StringArray{"research", "paper"},
		ModerationStatus: "active",
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	require.NoError(t, ts.DB.Create(&skill).Error)

	cases := []struct {
		name  string
		query string
	}{
		{name: "slug", query: "daily"},
		{name: "display name", query: "每日"},
		{name: "description", query: "摘要"},
		{name: "tag", query: "paper"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := ts.DoRequest(http.MethodGet, "/api/v1/search?q="+tc.query, nil)

			var body model.SearchResponse
			AssertJSONResponse(t, resp, http.StatusOK, &body)
			require.NotEmpty(t, body.Results)
			assert.Equal(t, "daily-paper", body.Results[0].Slug)
		})
	}
}

func TestListSkillsHonorsSortParameters(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureSkillSchema(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	now := time.Now().UTC()
	fixtures := []model.Skill{
		{
			ID:               uuid.NewString(),
			Slug:             "alpha",
			DisplayName:      "Alpha",
			ModerationStatus: "active",
			StatsDownloads:   10,
			StatsInstalls:    3,
			StatsStars:       1,
			CreatedAt:        now.Add(-3 * time.Hour),
			UpdatedAt:        now.Add(-3 * time.Hour),
		},
		{
			ID:               uuid.NewString(),
			Slug:             "beta",
			DisplayName:      "Beta",
			ModerationStatus: "active",
			StatsDownloads:   30,
			StatsInstalls:    7,
			StatsStars:       5,
			CreatedAt:        now.Add(-2 * time.Hour),
			UpdatedAt:        now.Add(-2 * time.Hour),
		},
		{
			ID:               uuid.NewString(),
			Slug:             "gamma",
			DisplayName:      "Gamma",
			ModerationStatus: "active",
			StatsDownloads:   20,
			StatsInstalls:    5,
			StatsStars:       9,
			CreatedAt:        now.Add(-1 * time.Hour),
			UpdatedAt:        now.Add(-1 * time.Hour),
		},
	}
	for _, skill := range fixtures {
		require.NoError(t, ts.DB.Create(&skill).Error)
	}

	t.Run("sort by downloads desc", func(t *testing.T) {
		resp := ts.DoRequest(http.MethodGet, "/api/v1/skills?sort=downloads&dir=desc", nil)

		var body model.SkillListResponse
		AssertJSONResponse(t, resp, http.StatusOK, &body)
		require.Len(t, body.Items, 3)
		assert.Equal(t, []string{"beta", "gamma", "alpha"}, []string{
			body.Items[0].Slug,
			body.Items[1].Slug,
			body.Items[2].Slug,
		})
	})

	t.Run("sort by name asc", func(t *testing.T) {
		resp := ts.DoRequest(http.MethodGet, "/api/v1/skills?sort=name&dir=asc", nil)

		var body model.SkillListResponse
		AssertJSONResponse(t, resp, http.StatusOK, &body)
		require.Len(t, body.Items, 3)
		assert.Equal(t, []string{"alpha", "beta", "gamma"}, []string{
			body.Items[0].Slug,
			body.Items[1].Slug,
			body.Items[2].Slug,
		})
	})

	t.Run("sort by stars desc", func(t *testing.T) {
		resp := ts.DoRequest(http.MethodGet, "/api/v1/skills?sort=stars&dir=desc", nil)

		var body model.SkillListResponse
		AssertJSONResponse(t, resp, http.StatusOK, &body)
		require.Len(t, body.Items, 3)
		assert.Equal(t, []string{"gamma", "beta", "alpha"}, []string{
			body.Items[0].Slug,
			body.Items[1].Slug,
			body.Items[2].Slug,
		})
	})
}

func TestListSkillsFiltersHighlighted(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureSkillSchema(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	now := time.Now().UTC()
	fixtures := []model.Skill{
		{
			ID:               uuid.NewString(),
			Slug:             "highlighted-skill",
			DisplayName:      "Highlighted Skill",
			ModerationStatus: "active",
			IsHighlighted:    true,
			CreatedAt:        now,
			UpdatedAt:        now,
		},
		{
			ID:               uuid.NewString(),
			Slug:             "regular-skill",
			DisplayName:      "Regular Skill",
			ModerationStatus: "active",
			IsHighlighted:    false,
			CreatedAt:        now.Add(-time.Hour),
			UpdatedAt:        now.Add(-time.Hour),
		},
	}
	for _, skill := range fixtures {
		require.NoError(t, ts.DB.Create(&skill).Error)
	}

	resp := ts.DoRequest(http.MethodGet, "/api/v1/skills?highlighted=1", nil)

	var body model.SkillListResponse
	AssertJSONResponse(t, resp, http.StatusOK, &body)
	require.Len(t, body.Items, 1)
	assert.Equal(t, "highlighted-skill", body.Items[0].Slug)
	assert.True(t, body.Items[0].Highlighted)
}

func TestDownloadIncrementsDownloadsAndInstalls(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureSkillSchema(t)
	ts.CleanupDatabase(t)
	defer ts.CleanupDatabase(t)

	now := time.Now().UTC()
	skill := model.Skill{
		ID:               uuid.NewString(),
		Slug:             "daily-paper",
		DisplayName:      "Daily Paper",
		ModerationStatus: "active",
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	require.NoError(t, ts.DB.Create(&skill).Error)

	version := model.SkillVersion{
		ID:        uuid.NewString(),
		SkillID:   skill.ID,
		Version:   "1.0.0",
		Changelog: "init",
		Files: model.FileList{
			{
				Path:       "SKILL.md",
				Size:       int64(len("# hello")),
				StorageKey: "skills/daily-paper/1.0.0/SKILL.md",
				SHA256:     "abc123",
			},
		},
		CreatedAt: now,
	}
	require.NoError(t, ts.DB.Create(&version).Error)
	require.NoError(t, ts.DB.Model(&skill).Update("latest_version_id", version.ID).Error)

	mockStorage := ts.StorageService.(*MockStorageService)
	mockStorage.SetFile(version.Files[0].StorageKey, []byte("# hello"))

	resp := ts.DoRequest(http.MethodGet, "/api/v1/download?slug=daily-paper", nil)
	assert.Equal(t, http.StatusOK, resp.Code)

	var updated model.Skill
	require.NoError(t, ts.DB.First(&updated, "id = ?", skill.ID).Error)
	assert.Equal(t, int64(1), updated.StatsDownloads)
	assert.Equal(t, int64(1), updated.StatsInstalls)
}
