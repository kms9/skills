package integration

import (
	"context"
	"testing"

	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/openclaw/clawhub/backend/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIdentityServiceUpsertExternalIdentityCreatesAndUpdatesBinding(t *testing.T) {
	ts := NewTestServer(t)
	ts.EnsureAuthSchema(t)
	ts.CleanupAuthTables(t)
	defer ts.CleanupAuthTables(t)

	identityService := service.NewIdentityService(ts.DB)

	createdUser, err := identityService.UpsertExternalIdentity(
		context.Background(),
		&service.ExternalIdentity{
			Provider:    "gitlab",
			Subject:     "gitlab-user-1",
			Username:    "gitlab-user",
			DisplayName: "GitLab User",
			Email:       "gitlab@example.com",
			AvatarURL:   "https://gitlab.example.com/avatar-1.png",
			RawClaims: map[string]any{
				"sub":                "gitlab-user-1",
				"preferred_username": "gitlab-user",
			},
		},
		func(_ context.Context, base string) (string, error) {
			return base, nil
		},
		func(_, _ string) string {
			return model.UserStatusReviewPending
		},
	)
	require.NoError(t, err)
	assert.Equal(t, "gitlab-user", createdUser.Handle)
	assert.Equal(t, "gitlab", createdUser.AuthProvider)

	var identity model.AuthIdentity
	require.NoError(t, ts.DB.Where("provider = ? AND provider_subject = ?", "gitlab", "gitlab-user-1").First(&identity).Error)
	assert.Equal(t, createdUser.ID, identity.UserID)
	assert.Equal(t, "gitlab@example.com", identity.ProviderEmail)

	updatedUser, err := identityService.UpsertExternalIdentity(
		context.Background(),
		&service.ExternalIdentity{
			Provider:    "gitlab",
			Subject:     "gitlab-user-1",
			Username:    "gitlab-user",
			DisplayName: "Renamed GitLab User",
			Email:       "renamed@example.com",
			AvatarURL:   "https://gitlab.example.com/avatar-2.png",
			RawClaims: map[string]any{
				"sub":                "gitlab-user-1",
				"preferred_username": "gitlab-user",
				"name":               "Renamed GitLab User",
			},
		},
		func(_ context.Context, base string) (string, error) {
			return base, nil
		},
		func(_, _ string) string {
			return model.UserStatusReviewPending
		},
	)
	require.NoError(t, err)
	assert.Equal(t, createdUser.ID, updatedUser.ID)
	assert.Equal(t, "Renamed GitLab User", updatedUser.DisplayName)
	assert.Equal(t, "renamed@example.com", updatedUser.Email)

	var users []model.User
	require.NoError(t, ts.DB.Find(&users).Error)
	assert.Len(t, users, 1)

	require.NoError(t, ts.DB.Where("provider = ? AND provider_subject = ?", "gitlab", "gitlab-user-1").First(&identity).Error)
	assert.Equal(t, "renamed@example.com", identity.ProviderEmail)
	assert.Equal(t, "https://gitlab.example.com/avatar-2.png", identity.ProviderAvatarURL)
	assert.NotNil(t, identity.LastLoginAt)
}
