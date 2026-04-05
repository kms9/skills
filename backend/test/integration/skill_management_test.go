package integration

import (
	"bytes"
	"net/http"
	"testing"
	"time"

	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSkillManagementPermissionsAndEndpoints(t *testing.T) {
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
	ts.EnsureSkillSchema(t)
	ts.EnsureAuthSchema(t)
	ts.CleanupDatabase(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupDatabase(t)
	defer ts.CleanupAuthTables(t)

	owner := model.User{
		Handle:          "owner-user-" + suffix(),
		DisplayName:     "Owner User",
		Email:           "owner-" + suffix() + "@example.com",
		Status:          model.UserStatusActive,
		AuthProvider:    "email",
		HasBoundEmail:   true,
		EmailVerifiedAt: verifiedAtPtr(),
	}
	require.NoError(t, ts.DB.Create(&owner).Error)
	require.NoError(t, ts.DB.First(&owner, "handle = ?", owner.Handle).Error)
	ownerToken, err := ts.AuthService.IssueJWT(&owner)
	require.NoError(t, err)

	other := model.User{
		Handle:          "other-user-" + suffix(),
		DisplayName:     "Other User",
		Email:           "other-" + suffix() + "@example.com",
		Status:          model.UserStatusActive,
		AuthProvider:    "email",
		HasBoundEmail:   true,
		EmailVerifiedAt: verifiedAtPtr(),
	}
	require.NoError(t, ts.DB.Create(&other).Error)
	require.NoError(t, ts.DB.First(&other, "handle = ?", other.Handle).Error)
	otherToken, err := ts.AuthService.IssueJWT(&other)
	require.NoError(t, err)

	super := model.User{
		Handle:       "superuserlogo-" + suffix(),
		DisplayName:  "Super User",
		Email:        "super@example.com",
		Status:       model.UserStatusActive,
		AuthProvider: "feishu",
	}
	require.NoError(t, ts.DB.Create(&super).Error)
	require.NoError(t, ts.DB.First(&super, "email = ?", super.Email).Error)
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

	superMeResp := ts.DoAuthenticatedRequest(http.MethodGet, "/api/v1/users/me", nil, superToken)
	assert.Equal(t, http.StatusOK, superMeResp.Code)
	assert.Contains(t, superMeResp.Body.String(), "\"hasBoundEmail\":false")
	assert.Contains(t, superMeResp.Body.String(), "\"isSuperuser\":true")
	assert.Contains(t, superMeResp.Body.String(), "\"hasManagementAccess\":true")

	ownerID := owner.ID
	skill := model.Skill{
		ID:               "a414b45d-f3a0-4f8d-b907-6a56cb1ed111",
		Slug:             "managed-skill-" + suffix(),
		DisplayName:      "Managed Skill",
		ModerationStatus: "active",
		StatsVersions:    1,
		OwnerUserID:      &ownerID,
	}
	require.NoError(t, ts.DB.Create(&skill).Error)
	version := model.SkillVersion{
		ID:        "c2aba4d8-fd99-4441-b328-31944e35f111",
		SkillID:   skill.ID,
		Version:   "1.0.0",
		Changelog: "initial",
		Files:     model.FileList{},
	}
	require.NoError(t, ts.DB.Create(&version).Error)
	require.NoError(t, ts.DB.Model(&skill).Update("latest_version_id", version.ID).Error)

	otherDeleteResp := ts.DoAuthenticatedRequest(http.MethodDelete, "/api/v1/skills/"+skill.Slug, nil, otherToken)
	assert.Equal(t, http.StatusForbidden, otherDeleteResp.Code)

	myListResp := ts.DoAuthenticatedRequest(http.MethodGet, "/api/v1/my/skills", nil, ownerToken)
	assert.Equal(t, http.StatusOK, myListResp.Code)
	assert.Contains(t, myListResp.Body.String(), "\"slug\":\""+skill.Slug+"\"")

	myDetailResp := ts.DoAuthenticatedRequest(http.MethodGet, "/api/v1/my/skills/"+skill.Slug, nil, ownerToken)
	assert.Equal(t, http.StatusOK, myDetailResp.Code)
	assert.Contains(t, myDetailResp.Body.String(), "\"versions\"")

	otherMyDetailResp := ts.DoAuthenticatedRequest(http.MethodGet, "/api/v1/my/skills/"+skill.Slug, nil, otherToken)
	assert.Equal(t, http.StatusForbidden, otherMyDetailResp.Code)

	superListResp := ts.DoAuthenticatedRequest(http.MethodGet, "/api/v1/admin/skills", nil, superToken)
	assert.Equal(t, http.StatusOK, superListResp.Code)
	assert.Contains(t, superListResp.Body.String(), "\"owner\"")
	assert.Contains(t, superListResp.Body.String(), "\"highlighted\":false")

	superDetailResp := ts.DoAuthenticatedRequest(http.MethodGet, "/api/v1/admin/skills/"+skill.Slug, nil, superToken)
	assert.Equal(t, http.StatusOK, superDetailResp.Code)
	assert.Contains(t, superDetailResp.Body.String(), "\"currentStatus\":\"active\"")

	setHighlightedResp := ts.DoAuthenticatedRequest(http.MethodPost, "/api/v1/admin/skills/"+skill.Slug+"/highlighted", bytes.NewBufferString(`{"highlighted":true}`), superToken)
	assert.Equal(t, http.StatusOK, setHighlightedResp.Code)

	require.NoError(t, ts.DB.First(&skill, "id = ?", skill.ID).Error)
	assert.True(t, skill.IsHighlighted)

	unsetHighlightedResp := ts.DoAuthenticatedRequest(http.MethodPost, "/api/v1/admin/skills/"+skill.Slug+"/highlighted", bytes.NewBufferString(`{"highlighted":false}`), superToken)
	assert.Equal(t, http.StatusOK, unsetHighlightedResp.Code)

	require.NoError(t, ts.DB.First(&skill, "id = ?", skill.ID).Error)
	assert.False(t, skill.IsHighlighted)

	adminDeleteResp := ts.DoAuthenticatedRequest(http.MethodPost, "/api/v1/admin/skills/"+skill.Slug+"/delete", bytes.NewBufferString(`{}`), superToken)
	assert.Equal(t, http.StatusOK, adminDeleteResp.Code)

	var deleted model.Skill
	require.NoError(t, ts.DB.First(&deleted, "id = ?", skill.ID).Error)
	assert.True(t, deleted.IsDeleted)

	ownerUndeleteResp := ts.DoAuthenticatedRequest(http.MethodPost, "/api/v1/skills/"+skill.Slug+"/undelete", bytes.NewBufferString(`{}`), ownerToken)
	assert.Equal(t, http.StatusOK, ownerUndeleteResp.Code)

	require.NoError(t, ts.DB.First(&deleted, "id = ?", skill.ID).Error)
	assert.False(t, deleted.IsDeleted)

	require.NoError(t, ts.DB.Model(&deleted).Update("is_deleted", true).Error)
	otherUndeleteResp := ts.DoAuthenticatedRequest(http.MethodPost, "/api/v1/skills/"+skill.Slug+"/undelete", bytes.NewBufferString(`{}`), otherToken)
	assert.Equal(t, http.StatusForbidden, otherUndeleteResp.Code)

	adminUserDetailResp := ts.DoAuthenticatedRequest(http.MethodGet, "/api/v1/admin/users/"+owner.ID, nil, superToken)
	assert.Equal(t, http.StatusOK, adminUserDetailResp.Code)
	assert.Contains(t, adminUserDetailResp.Body.String(), "\"skills\"")
	assert.Contains(t, adminUserDetailResp.Body.String(), "\""+skill.Slug+"\"")
}

func suffix() string {
	return time.Now().Format("150405.000000000")
}
