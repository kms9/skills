package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/openclaw/clawhub/backend/internal/model"
	"gorm.io/gorm"
)

type IdentityService struct {
	db *gorm.DB
}

func NewIdentityService(db *gorm.DB) *IdentityService {
	return &IdentityService{db: db}
}

func (s *IdentityService) UpsertExternalIdentity(
	ctx context.Context,
	identity *ExternalIdentity,
	uniqueHandle func(context.Context, string) (string, error),
	initialStatus func(string, string) string,
) (*model.User, error) {
	var authIdentity model.AuthIdentity
	err := s.db.WithContext(ctx).
		Where("provider = ? AND provider_subject = ?", identity.Provider, identity.Subject).
		First(&authIdentity).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, fmt.Errorf("failed to query auth identity: %w", err)
	}

	now := time.Now().UTC()
	rawClaims := "{}"
	if identity.RawClaims != nil {
		if bytes, marshalErr := json.Marshal(identity.RawClaims); marshalErr == nil {
			rawClaims = string(bytes)
		}
	}

	if err == nil {
		var user model.User
		if err := s.db.WithContext(ctx).First(&user, "id = ?", authIdentity.UserID).Error; err != nil {
			return nil, fmt.Errorf("failed to load user: %w", err)
		}

		updates := map[string]any{
			"display_name":  displayNameForIdentity(identity),
			"avatar_url":    strings.TrimSpace(identity.AvatarURL),
			"auth_provider": identity.Provider,
			"last_login_at": now,
		}
		if !user.HasBoundEmail && strings.TrimSpace(identity.Email) != "" {
			updates["email"] = strings.TrimSpace(identity.Email)
		}
		if err := s.db.WithContext(ctx).Model(&user).Updates(updates).Error; err != nil {
			return nil, fmt.Errorf("failed to update user: %w", err)
		}

		if err := s.db.WithContext(ctx).Model(&authIdentity).Updates(map[string]any{
			"provider_username":   strings.TrimSpace(identity.Username),
			"provider_email":      strings.TrimSpace(identity.Email),
			"provider_avatar_url": strings.TrimSpace(identity.AvatarURL),
			"provider_open_id":    strings.TrimSpace(identity.OpenID),
			"provider_union_id":   strings.TrimSpace(identity.UnionID),
			"provider_tenant_key": strings.TrimSpace(identity.TenantKey),
			"raw_claims":          rawClaims,
			"last_login_at":       now,
		}).Error; err != nil {
			return nil, fmt.Errorf("failed to update auth identity: %w", err)
		}

		user.DisplayName = displayNameForIdentity(identity)
		if email := strings.TrimSpace(identity.Email); email != "" && !user.HasBoundEmail {
			user.Email = email
		}
		user.AvatarURL = strings.TrimSpace(identity.AvatarURL)
		user.AuthProvider = identity.Provider
		user.LastLoginAt = &now
		return &user, nil
	}

	baseHandle := handleBaseForIdentity(identity)
	handle, err := uniqueHandle(ctx, baseHandle)
	if err != nil {
		return nil, err
	}

	user := model.User{
		Handle:       handle,
		DisplayName:  displayNameForIdentity(identity),
		Email:        strings.TrimSpace(identity.Email),
		AvatarURL:    strings.TrimSpace(identity.AvatarURL),
		Role:         "user",
		Status:       initialStatus(strings.TrimSpace(identity.Email), handle),
		AuthProvider: identity.Provider,
		LastLoginAt:  &now,
	}
	if err := s.db.WithContext(ctx).Create(&user).Error; err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	authIdentity = model.AuthIdentity{
		UserID:            user.ID,
		Provider:          identity.Provider,
		ProviderSubject:   identity.Subject,
		ProviderUsername:  strings.TrimSpace(identity.Username),
		ProviderEmail:     strings.TrimSpace(identity.Email),
		ProviderAvatarURL: strings.TrimSpace(identity.AvatarURL),
		ProviderOpenID:    strings.TrimSpace(identity.OpenID),
		ProviderUnionID:   strings.TrimSpace(identity.UnionID),
		ProviderTenantKey: strings.TrimSpace(identity.TenantKey),
		RawClaims:         rawClaims,
		LastLoginAt:       &now,
	}
	if err := s.db.WithContext(ctx).Create(&authIdentity).Error; err != nil {
		return nil, fmt.Errorf("failed to create auth identity: %w", err)
	}

	return &user, nil
}

func (s *IdentityService) BindExternalIdentity(ctx context.Context, user *model.User, identity *ExternalIdentity) error {
	var existing model.AuthIdentity
	err := s.db.WithContext(ctx).
		Where("provider = ? AND provider_subject = ?", identity.Provider, identity.Subject).
		First(&existing).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return fmt.Errorf("failed to query auth identity: %w", err)
	}
	if err == nil && existing.UserID != user.ID {
		return gorm.ErrDuplicatedKey
	}

	now := time.Now().UTC()
	rawClaims := "{}"
	if identity.RawClaims != nil {
		if bytes, marshalErr := json.Marshal(identity.RawClaims); marshalErr == nil {
			rawClaims = string(bytes)
		}
	}

	if err == nil {
		return s.db.WithContext(ctx).Model(&existing).Updates(map[string]any{
			"provider_username":   strings.TrimSpace(identity.Username),
			"provider_email":      strings.TrimSpace(identity.Email),
			"provider_avatar_url": strings.TrimSpace(identity.AvatarURL),
			"provider_open_id":    strings.TrimSpace(identity.OpenID),
			"provider_union_id":   strings.TrimSpace(identity.UnionID),
			"provider_tenant_key": strings.TrimSpace(identity.TenantKey),
			"raw_claims":          rawClaims,
			"last_login_at":       now,
		}).Error
	}

	authIdentity := model.AuthIdentity{
		UserID:            user.ID,
		Provider:          identity.Provider,
		ProviderSubject:   identity.Subject,
		ProviderUsername:  strings.TrimSpace(identity.Username),
		ProviderEmail:     strings.TrimSpace(identity.Email),
		ProviderAvatarURL: strings.TrimSpace(identity.AvatarURL),
		ProviderOpenID:    strings.TrimSpace(identity.OpenID),
		ProviderUnionID:   strings.TrimSpace(identity.UnionID),
		ProviderTenantKey: strings.TrimSpace(identity.TenantKey),
		RawClaims:         rawClaims,
		LastLoginAt:       &now,
	}
	if err := s.db.WithContext(ctx).Create(&authIdentity).Error; err != nil {
		return fmt.Errorf("failed to create auth identity: %w", err)
	}
	return nil
}

func (s *IdentityService) ListUserIdentities(ctx context.Context, userID string) ([]model.AuthIdentity, error) {
	var identities []model.AuthIdentity
	if err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at ASC").
		Find(&identities).Error; err != nil {
		return nil, fmt.Errorf("failed to list auth identities: %w", err)
	}
	return identities, nil
}

func displayNameForIdentity(identity *ExternalIdentity) string {
	if name := strings.TrimSpace(identity.DisplayName); name != "" {
		return name
	}
	if username := strings.TrimSpace(identity.Username); username != "" {
		return username
	}
	return "user"
}

func handleBaseForIdentity(identity *ExternalIdentity) string {
	if username := strings.TrimSpace(identity.Username); username != "" {
		return username
	}
	if email := strings.TrimSpace(identity.Email); email != "" {
		return handleFromEmail(email)
	}
	return "user"
}
