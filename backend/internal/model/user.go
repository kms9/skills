package model

import "time"

const (
	UserStatusEmailPending  = "email_pending"
	UserStatusReviewPending = "review_pending"
	UserStatusActive        = "active"
	UserStatusRejected      = "rejected"
	UserStatusDisabled      = "disabled"
)

type User struct {
	ID           string     `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	GithubID     *int64     `gorm:"uniqueIndex" json:"githubId,omitempty"`
	Handle       string     `gorm:"uniqueIndex;not null" json:"handle"`
	DisplayName  string     `gorm:"not null;default:''" json:"displayName"`
	Email        string     `gorm:"not null;default:''" json:"email"`
	PendingEmail string     `gorm:"not null;default:''" json:"pendingEmail,omitempty"`
	AvatarURL    string     `gorm:"not null;default:''" json:"avatarUrl"`
	Bio          string     `gorm:"not null;default:''" json:"bio"`
	Role         string     `gorm:"not null;default:'user'" json:"role"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	LastLoginAt  *time.Time `json:"lastLoginAt,omitempty"`

	PasswordHash        string     `gorm:"not null;default:''" json:"-"`
	Status              string     `gorm:"not null;default:'active'" json:"status"`
	ActivationCode      *string    `json:"-"`
	ActivationExpiresAt *time.Time `json:"-"`
	AuthProvider        string     `gorm:"not null;default:'github'" json:"authProvider"`
	HasBoundEmail       bool       `gorm:"not null;default:false" json:"hasBoundEmail"`
	EmailVerifiedAt     *time.Time `json:"emailVerifiedAt,omitempty"`
	ReviewedBy          *string    `gorm:"type:uuid" json:"reviewedBy,omitempty"`
	ReviewedAt          *time.Time `json:"reviewedAt,omitempty"`
	ReviewNote          string     `gorm:"not null;default:''" json:"reviewNote,omitempty"`
}

type AuthIdentity struct {
	ID                string     `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID            string     `gorm:"type:uuid;not null;index" json:"userId"`
	Provider          string     `gorm:"not null;uniqueIndex:idx_provider_subject" json:"provider"`
	ProviderSubject   string     `gorm:"not null;uniqueIndex:idx_provider_subject" json:"providerSubject"`
	ProviderUsername  string     `gorm:"not null;default:''" json:"providerUsername"`
	ProviderEmail     string     `gorm:"not null;default:''" json:"providerEmail"`
	ProviderAvatarURL string     `gorm:"not null;default:''" json:"providerAvatarUrl"`
	ProviderOpenID    string     `gorm:"not null;default:''" json:"providerOpenId"`
	ProviderUnionID   string     `gorm:"not null;default:''" json:"providerUnionId"`
	ProviderTenantKey string     `gorm:"not null;default:''" json:"providerTenantKey"`
	RawClaims         string     `gorm:"type:jsonb" json:"-"`
	LastLoginAt       *time.Time `json:"lastLoginAt,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

type APIToken struct {
	ID         string     `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID     string     `gorm:"type:uuid;not null" json:"userId"`
	Label      string     `gorm:"not null" json:"label"`
	TokenHash  string     `gorm:"uniqueIndex;not null" json:"-"`
	LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
}

type UserStar struct {
	UserID    string    `gorm:"type:uuid;primaryKey" json:"userId"`
	SkillID   string    `gorm:"type:uuid;primaryKey" json:"skillId"`
	CreatedAt time.Time `json:"createdAt"`
}

type SkillComment struct {
	ID        string    `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	SkillID   string    `gorm:"type:uuid;not null;index" json:"skillId"`
	UserID    string    `gorm:"type:uuid;not null;index" json:"userId"`
	Body      string    `gorm:"not null" json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
