package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService struct {
	db                 *gorm.DB
	sessionService     *SessionService
	identityService    *IdentityService
	providers          map[string]IdentityProvider
	frontendURL        string
	oauthPublicBaseURL string
	allowedDomains     []string
	emailService       *EmailService
	superusers         config.SuperusersConfig
	feishuProvider     *FeishuProvider
}

var (
	ErrEmailDomainNotAllowed  = errors.New("email domain not allowed")
	ErrPasswordTooShort       = errors.New("password must be at least 8 characters")
	ErrEmailAlreadyRegistered = errors.New("email already registered")
	ErrEmailBindingRequired   = errors.New("email binding requires login")
	ErrEmailAlreadyBound      = errors.New("email already bound")
	ErrActivationCodeInvalid  = errors.New("invalid or expired code")
	ErrEmailAuthDisabled      = errors.New("email registration unavailable")
	ErrAccountEmailPending    = errors.New("account not activated")
	ErrAccountReviewPending   = errors.New("account pending review")
	ErrAccountRejected        = errors.New("account rejected")
	ErrAccountDisabled        = errors.New("account disabled")
	ErrEmailNotBound          = errors.New("email not bound to any account")
	ErrFeishuAuthDisabled     = errors.New("feishu auth unavailable")
	ErrFeishuIdentityConflict = errors.New("feishu account already bound")
)

func NewAuthService(db *gorm.DB, clientID, clientSecret, jwtSecret, frontendURL string) *AuthService {
	cfg := config.AuthConfig{
		GitHubClientID:     clientID,
		GitHubClientSecret: clientSecret,
		JWTSecret:          jwtSecret,
		FrontendURL:        frontendURL,
		GitHub: config.OAuthProviderConfig{
			Enabled:      clientID != "" && clientSecret != "",
			ClientID:     clientID,
			ClientSecret: clientSecret,
		},
	}
	return NewAuthServiceWithConfig(db, cfg)
}

func NewAuthServiceWithConfig(db *gorm.DB, cfg config.AuthConfig) *AuthService {
	authService := &AuthService{
		db:                 db,
		sessionService:     NewSessionService(cfg.JWTSecret, cfg.FrontendURL),
		identityService:    NewIdentityService(db),
		providers:          make(map[string]IdentityProvider),
		frontendURL:        cfg.FrontendURL,
		oauthPublicBaseURL: strings.TrimRight(cfg.OAuthPublicBaseURL, "/"),
		allowedDomains:     cfg.AllowedEmailDomains,
		superusers:         cfg.Superusers,
		feishuProvider:     NewFeishuProvider(cfg.Feishu),
	}

	if provider := NewGitHubProvider(cfg.GitHub); provider.Enabled() {
		authService.providers[provider.Name()] = provider
	}
	if provider, err := NewGitLabOIDCProvider(cfg.GitLab); err == nil && provider.Enabled() {
		authService.providers[provider.Name()] = provider
	}
	if authService.feishuProvider != nil && authService.feishuProvider.Enabled() {
		authService.providers[authService.feishuProvider.Name()] = authService.feishuProvider
	}

	return authService
}

func (s *AuthService) SetEmailAuth(domains []string, emailService *EmailService) {
	s.allowedDomains = domains
	s.emailService = emailService
}

func (s *AuthService) EmailAuthEnabled() bool {
	return s.emailService != nil
}

func (s *AuthService) FeishuEnabled() bool {
	return s.feishuProvider != nil && s.feishuProvider.Enabled()
}

func (s *AuthService) Provider(name string) (IdentityProvider, bool) {
	provider, ok := s.providers[name]
	return provider, ok
}

func (s *AuthService) BuildAuthRedirect(providerName, redirectURI string) (*AuthRedirect, error) {
	provider, ok := s.Provider(providerName)
	if !ok {
		return nil, fmt.Errorf("provider not configured")
	}
	state, err := randomHex(16)
	if err != nil {
		return nil, fmt.Errorf("failed to generate state: %w", err)
	}
	nonce := ""
	if provider.UsesNonce() {
		nonce, err = randomHex(16)
		if err != nil {
			return nil, fmt.Errorf("failed to generate nonce: %w", err)
		}
	}
	authURL, err := provider.BuildAuthURL(AuthRequestInput{
		RedirectURI: redirectURI,
		State:       state,
		Nonce:       nonce,
	})
	if err != nil {
		return nil, err
	}
	return &AuthRedirect{
		URL:   authURL,
		State: state,
		Nonce: nonce,
	}, nil
}

func (s *AuthService) CompleteOAuthLogin(ctx context.Context, providerName, code, redirectURI, expectedNonce string) (*model.User, error) {
	provider, ok := s.Provider(providerName)
	if !ok {
		return nil, fmt.Errorf("provider not configured")
	}
	tokenSet, err := provider.ExchangeCode(ctx, ExchangeCodeInput{
		Code:        code,
		RedirectURI: redirectURI,
	})
	if err != nil {
		return nil, err
	}
	identity, err := provider.FetchIdentity(ctx, tokenSet, expectedNonce)
	if err != nil {
		return nil, err
	}
	user, err := s.identityService.UpsertExternalIdentity(ctx, identity, s.uniqueHandle, s.initialStatusForIdentity(identity))
	if err != nil {
		return nil, err
	}
	return s.autoApproveSuperuserIfNeeded(ctx, user)
}

func (s *AuthService) CompleteFeishuH5Login(ctx context.Context, code string) (*model.User, error) {
	if !s.FeishuEnabled() {
		return nil, ErrFeishuAuthDisabled
	}
	tokenSet, err := s.feishuProvider.ExchangeH5Code(ctx, code)
	if err != nil {
		return nil, err
	}
	identity, err := s.feishuProvider.FetchIdentity(ctx, tokenSet, "")
	if err != nil {
		return nil, err
	}
	user, err := s.identityService.UpsertExternalIdentity(ctx, identity, s.uniqueHandle, s.initialStatusForIdentity(identity))
	if err != nil {
		return nil, err
	}
	logrus.WithFields(logrus.Fields{
		"provider":   "feishu",
		"user_id":    user.ID,
		"handle":     user.Handle,
		"tenant_key": identity.TenantKey,
	}).Info("feishu h5 login completed")
	return s.autoApproveSuperuserIfNeeded(ctx, user)
}

func (s *AuthService) BindFeishuIdentity(ctx context.Context, user *model.User, code string) error {
	if user == nil {
		return ErrEmailBindingRequired
	}
	if !s.FeishuEnabled() {
		return ErrFeishuAuthDisabled
	}
	tokenSet, err := s.feishuProvider.ExchangeH5Code(ctx, code)
	if err != nil {
		return err
	}
	identity, err := s.feishuProvider.FetchIdentity(ctx, tokenSet, "")
	if err != nil {
		return err
	}
	if err := s.identityService.BindExternalIdentity(ctx, user, identity); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return ErrFeishuIdentityConflict
		}
		return err
	}
	logrus.WithFields(logrus.Fields{
		"provider":   "feishu",
		"user_id":    user.ID,
		"handle":     user.Handle,
		"tenant_key": identity.TenantKey,
	}).Info("feishu identity bound")
	return nil
}

func (s *AuthService) CompleteOAuthBinding(ctx context.Context, user *model.User, providerName, code, redirectURI, expectedNonce string) error {
	if user == nil {
		return ErrEmailBindingRequired
	}
	provider, ok := s.Provider(providerName)
	if !ok {
		return fmt.Errorf("provider not configured")
	}
	tokenSet, err := provider.ExchangeCode(ctx, ExchangeCodeInput{
		Code:        code,
		RedirectURI: redirectURI,
	})
	if err != nil {
		return err
	}
	identity, err := provider.FetchIdentity(ctx, tokenSet, expectedNonce)
	if err != nil {
		return err
	}
	if err := s.identityService.BindExternalIdentity(ctx, user, identity); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			if providerName == "feishu" {
				return ErrFeishuIdentityConflict
			}
			return fmt.Errorf("%s account already bound", providerName)
		}
		return err
	}
	logrus.WithFields(logrus.Fields{
		"provider": providerName,
		"user_id":  user.ID,
		"handle":   user.Handle,
	}).Info("oauth identity bound")
	return nil
}

func (s *AuthService) IssueJWT(user *model.User) (string, error) {
	return s.sessionService.IssueJWT(user)
}

func (s *AuthService) ParseJWT(tokenStr string) (jwt.MapClaims, error) {
	return s.sessionService.ParseJWT(tokenStr)
}

func (s *AuthService) FrontendURL() string {
	return s.sessionService.FrontendURL()
}

func (s *AuthService) OAuthPublicBaseURL() string {
	return s.oauthPublicBaseURL
}

func (s *AuthService) IsSuperuser(user *model.User) bool {
	if user == nil {
		return false
	}
	identities, err := s.identityService.ListUserIdentities(context.Background(), user.ID)
	if err != nil {
		logrus.WithError(err).WithField("user_id", user.ID).Warn("failed to load identities for superuser check")
		return false
	}
	return s.IsSuperuserByIdentities(user, identities)
}

func (s *AuthService) IsSuperuserByIdentities(user *model.User, identities []model.AuthIdentity) bool {
	if user == nil {
		return false
	}
	if len(identities) == 0 {
		return false
	}
	for _, identity := range identities {
		if s.isProviderSuperuserMatch(identity) {
			return true
		}
	}
	return false
}

func (s *AuthService) isProviderSuperuserMatch(identity model.AuthIdentity) bool {
	if len(s.superusers.Providers) == 0 {
		return false
	}
	providerConfig, ok := s.superusers.Providers[strings.ToLower(strings.TrimSpace(identity.Provider))]
	if !ok {
		return false
	}
	for _, candidate := range providerConfig.Emails {
		if candidate != "" && strings.EqualFold(strings.TrimSpace(candidate), strings.TrimSpace(identity.ProviderEmail)) {
			return true
		}
	}
	for _, candidate := range providerConfig.Subjects {
		if strings.TrimSpace(candidate) != "" && strings.TrimSpace(candidate) == strings.TrimSpace(identity.ProviderSubject) {
			return true
		}
	}
	return false
}

func (s *AuthService) initialStatusForCandidate(_, _ string) string {
	return model.UserStatusReviewPending
}

func (s *AuthService) initialStatusForExternalCandidate(_, _ string) string {
	return model.UserStatusReviewPending
}

func (s *AuthService) initialStatusForFeishuCandidate(_, _ string) string {
	return model.UserStatusActive
}

func (s *AuthService) initialStatusForIdentity(identity *ExternalIdentity) func(string, string) string {
	if identity != nil && identity.Provider == "feishu" {
		return s.initialStatusForFeishuCandidate
	}
	return s.initialStatusForExternalCandidate
}

func (s *AuthService) HasBoundEmail(user *model.User) bool {
	if user == nil {
		return false
	}
	return user.HasBoundEmail && strings.TrimSpace(user.Email) != "" && user.EmailVerifiedAt != nil
}

func (s *AuthService) HasManagementAccess(user *model.User) bool {
	if user == nil {
		return false
	}
	return user.Role == "admin" || user.Role == "moderator" || s.IsSuperuser(user)
}

func (s *AuthService) EnsureLoginAllowed(user *model.User) error {
	if user == nil {
		return ErrAccountRejected
	}
	switch user.Status {
	case model.UserStatusActive:
		return nil
	case model.UserStatusEmailPending:
		return ErrAccountEmailPending
	case model.UserStatusReviewPending:
		return ErrAccountReviewPending
	case model.UserStatusRejected:
		return ErrAccountRejected
	case model.UserStatusDisabled:
		return ErrAccountDisabled
	default:
		return ErrAccountRejected
	}
}

func (s *AuthService) IsEmailDomainAllowed(email string) bool {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return false
	}
	domain := strings.ToLower(parts[1])
	for _, d := range s.allowedDomains {
		if strings.ToLower(d) == domain {
			return true
		}
	}
	return false
}

func (s *AuthService) uniqueHandle(ctx context.Context, base string) (string, error) {
	handle := base
	for i := 2; i <= 100; i++ {
		var count int64
		if err := s.db.WithContext(ctx).Model(&model.User{}).Where("handle = ?", handle).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return handle, nil
		}
		handle = fmt.Sprintf("%s%d", base, i)
	}
	return "", fmt.Errorf("could not find unique handle for %s", base)
}

const (
	bcryptCost        = 12
	activationCodeLen = 6
	activationTTL     = 10 * time.Minute
	resendCooldown    = 60 * time.Second
)

func (s *AuthService) StartEmailBinding(ctx context.Context, user *model.User, email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if user == nil {
		return ErrEmailBindingRequired
	}
	if !s.EmailAuthEnabled() {
		return ErrEmailAuthDisabled
	}
	if s.HasBoundEmail(user) {
		return ErrEmailAlreadyBound
	}
	if !s.IsEmailDomainAllowed(email) {
		return ErrEmailDomainNotAllowed
	}
	if len(password) < 8 {
		return ErrPasswordTooShort
	}
	if conflict, err := s.emailOwnedByAnotherUser(ctx, user.ID, email); err != nil {
		return err
	} else if conflict {
		return ErrEmailAlreadyRegistered
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	code, err := generateActivationCode()
	if err != nil {
		return fmt.Errorf("failed to generate code: %w", err)
	}
	expiresAt := time.Now().Add(activationTTL)

	updates := map[string]any{
		"pending_email":         email,
		"password_hash":         string(hash),
		"activation_code":       code,
		"activation_expires_at": expiresAt,
		"auth_provider":         "feishu",
	}
	if err := s.db.WithContext(ctx).Model(user).Updates(updates).Error; err != nil {
		return fmt.Errorf("failed to start email binding: %w", err)
	}
	user.PendingEmail = email
	user.PasswordHash = string(hash)
	user.AuthProvider = "feishu"

	if s.emailService != nil {
		if err := s.emailService.SendActivationEmail(email, code); err != nil {
			return fmt.Errorf("failed to send activation email: %w", err)
		}
	}
	logrus.WithFields(logrus.Fields{
		"user_id": user.ID,
		"email":   email,
	}).Info("email binding started")
	return nil
}

func (s *AuthService) CompleteEmailBinding(ctx context.Context, user *model.User, email, code string) (*model.User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if user == nil {
		return nil, "", ErrEmailBindingRequired
	}
	if strings.TrimSpace(user.PendingEmail) != email {
		return nil, "", ErrActivationCodeInvalid
	}
	if user.ActivationCode == nil || user.ActivationExpiresAt == nil {
		return nil, "", ErrActivationCodeInvalid
	}
	if time.Now().After(*user.ActivationExpiresAt) || *user.ActivationCode != strings.TrimSpace(code) {
		return nil, "", ErrActivationCodeInvalid
	}
	if conflict, err := s.emailOwnedByAnotherUser(ctx, user.ID, email); err != nil {
		return nil, "", err
	} else if conflict {
		return nil, "", ErrEmailAlreadyRegistered
	}

	now := time.Now().UTC()
	updates := map[string]any{
		"email":                 email,
		"pending_email":         "",
		"has_bound_email":       true,
		"email_verified_at":     now,
		"activation_code":       nil,
		"activation_expires_at": nil,
	}
	if strings.TrimSpace(user.AuthProvider) == "" || user.AuthProvider == "email" {
		updates["auth_provider"] = "email"
	}
	if err := s.db.WithContext(ctx).Model(user).Updates(updates).Error; err != nil {
		return nil, "", fmt.Errorf("failed to complete email binding: %w", err)
	}
	user.Email = email
	user.PendingEmail = ""
	user.HasBoundEmail = true
	user.EmailVerifiedAt = &now
	user.ActivationCode = nil
	user.ActivationExpiresAt = nil

	if strings.TrimSpace(user.AuthProvider) == "" || user.AuthProvider == "email" {
		user.AuthProvider = "email"
	}

	logrus.WithFields(logrus.Fields{
		"user_id": user.ID,
		"email":   user.Email,
	}).Info("email binding completed")

	updated, err := s.autoApproveSuperuserIfNeeded(ctx, user)
	if err != nil {
		return nil, "", err
	}
	return updated, "", nil
}

func (s *AuthService) ResendEmailBinding(ctx context.Context, user *model.User) error {
	if user == nil {
		return ErrEmailBindingRequired
	}
	if strings.TrimSpace(user.PendingEmail) == "" {
		return ErrActivationCodeInvalid
	}
	return s.regenerateActivation(ctx, user)
}

func (s *AuthService) Register(ctx context.Context, email, password, displayName string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if !s.EmailAuthEnabled() {
		return ErrEmailAuthDisabled
	}
	if !s.IsEmailDomainAllowed(email) {
		return ErrEmailDomainNotAllowed
	}
	if len(password) < 8 {
		return ErrPasswordTooShort
	}

	var existing model.User
	err := s.db.WithContext(ctx).
		Where("LOWER(email) = ? OR LOWER(pending_email) = ?", email, email).
		First(&existing).Error
	if err == nil {
		if existing.Status == model.UserStatusEmailPending {
			return s.regenerateActivation(ctx, &existing)
		}
		return ErrEmailAlreadyRegistered
	}
	if err != gorm.ErrRecordNotFound {
		return fmt.Errorf("failed to check email: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	code, err := generateActivationCode()
	if err != nil {
		return fmt.Errorf("failed to generate code: %w", err)
	}
	expiresAt := time.Now().Add(activationTTL)

	handle, err := s.uniqueHandle(ctx, handleFromEmail(email))
	if err != nil {
		return err
	}

	user := model.User{
		Handle:              handle,
		DisplayName:         displayName,
		PendingEmail:        email,
		PasswordHash:        string(hash),
		Status:              model.UserStatusEmailPending,
		ActivationCode:      &code,
		ActivationExpiresAt: &expiresAt,
		AuthProvider:        "email",
		Role:                "user",
		HasBoundEmail:       false,
	}
	if err := s.db.WithContext(ctx).Create(&user).Error; err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}

	if s.emailService != nil {
		if err := s.emailService.SendActivationEmail(email, code); err != nil {
			return fmt.Errorf("failed to send activation email: %w", err)
		}
	}
	return nil
}

func (s *AuthService) Activate(ctx context.Context, email, code string) (*model.User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var user model.User
	if err := s.db.WithContext(ctx).
		Where("(LOWER(pending_email) = ? OR LOWER(email) = ?) AND status = ?", email, email, model.UserStatusEmailPending).
		First(&user).Error; err != nil {
		return nil, "", ErrActivationCodeInvalid
	}
	if user.ActivationCode == nil || user.ActivationExpiresAt == nil {
		return nil, "", ErrActivationCodeInvalid
	}
	if time.Now().After(*user.ActivationExpiresAt) || *user.ActivationCode != code {
		return nil, "", ErrActivationCodeInvalid
	}

	nextStatus := s.initialStatusForCandidate(email, user.Handle)
	now := time.Now().UTC()
	if err := s.db.WithContext(ctx).Model(&user).Updates(map[string]any{
		"email":                 email,
		"pending_email":         "",
		"has_bound_email":       true,
		"email_verified_at":     now,
		"status":                nextStatus,
		"activation_code":       nil,
		"activation_expires_at": nil,
	}).Error; err != nil {
		return nil, "", fmt.Errorf("failed to activate: %w", err)
	}
	user.Email = email
	user.PendingEmail = ""
	user.HasBoundEmail = true
	user.EmailVerifiedAt = &now
	user.Status = nextStatus
	if nextStatus != model.UserStatusActive {
		user.LastLoginAt = nil
		return &user, "", nil
	}

	if err := s.db.WithContext(ctx).Model(&user).Updates(map[string]any{
		"last_login_at": now,
		"review_note":   "superuser auto-approved on activation",
		"reviewed_at":   now,
	}).Error; err != nil {
		return nil, "", fmt.Errorf("failed to finalize activation: %w", err)
	}
	user.LastLoginAt = &now
	user.ReviewNote = "superuser auto-approved on activation"
	user.ReviewedAt = &now

	token, err := s.IssueJWT(&user)
	if err != nil {
		return nil, "", fmt.Errorf("failed to issue token: %w", err)
	}
	return &user, token, nil
}

func (s *AuthService) LoginWithEmail(ctx context.Context, email, password string) (*model.User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var user model.User
	if err := s.db.WithContext(ctx).Where("LOWER(email) = ?", email).First(&user).Error; err != nil {
		return nil, "", ErrEmailNotBound
	}
	if updated, err := s.autoApproveSuperuserIfNeeded(ctx, &user); err != nil {
		return nil, "", err
	} else {
		user = *updated
	}
	if err := s.EnsureLoginAllowed(&user); err != nil {
		return nil, "", err
	}
	if !s.HasBoundEmail(&user) || strings.TrimSpace(user.PasswordHash) == "" {
		return nil, "", ErrEmailNotBound
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", fmt.Errorf("invalid credentials")
	}

	now := time.Now().UTC()
	if err := s.db.WithContext(ctx).Model(&user).Update("last_login_at", now).Error; err != nil {
		return nil, "", fmt.Errorf("failed to update login time: %w", err)
	}
	user.LastLoginAt = &now
	logrus.WithFields(logrus.Fields{
		"user_id": user.ID,
		"email":   user.Email,
	}).Info("email auxiliary login completed")

	token, err := s.IssueJWT(&user)
	if err != nil {
		return nil, "", fmt.Errorf("failed to issue token: %w", err)
	}
	return &user, token, nil
}

func (s *AuthService) ResendActivation(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))

	var user model.User
	if err := s.db.WithContext(ctx).
		Where("(LOWER(pending_email) = ? OR LOWER(email) = ?) AND status = ?", email, email, model.UserStatusEmailPending).
		First(&user).Error; err != nil {
		return nil
	}
	if user.ActivationExpiresAt != nil {
		cooldownEnd := user.ActivationExpiresAt.Add(-activationTTL + resendCooldown)
		if time.Now().Before(cooldownEnd) {
			return fmt.Errorf("please wait before requesting another code")
		}
	}
	return s.regenerateActivation(ctx, &user)
}

func (s *AuthService) ListUsersForReview(ctx context.Context, statusFilter, query string, limit int) ([]model.User, error) {
	q := s.db.WithContext(ctx).Model(&model.User{}).Order("created_at DESC")
	if statusFilter != "" {
		q = q.Where("status = ?", statusFilter)
	}
	if trimmed := strings.TrimSpace(query); trimmed != "" {
		like := "%" + trimmed + "%"
		q = q.Where("email ILIKE ? OR handle ILIKE ? OR display_name ILIKE ?", like, like, like)
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var users []model.User
	if err := q.Limit(limit).Find(&users).Error; err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	return users, nil
}

func (s *AuthService) GetUserByID(ctx context.Context, id string) (*model.User, error) {
	var user model.User
	if err := s.db.WithContext(ctx).First(&user, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *AuthService) ListUserIdentities(ctx context.Context, userID string) ([]model.AuthIdentity, error) {
	return s.identityService.ListUserIdentities(ctx, userID)
}

func (s *AuthService) UpdateUserReviewStatus(ctx context.Context, actor *model.User, targetID, status, note string) (*model.User, error) {
	user, err := s.GetUserByID(ctx, targetID)
	if err != nil {
		return nil, err
	}
	if !validReviewTransition(user.Status, status) {
		return nil, fmt.Errorf("invalid status transition")
	}

	now := time.Now().UTC()
	updates := map[string]any{
		"status":      status,
		"review_note": strings.TrimSpace(note),
		"reviewed_at": now,
	}
	if actor != nil {
		updates["reviewed_by"] = actor.ID
	}
	if err := s.db.WithContext(ctx).Model(user).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("failed to update user review status: %w", err)
	}
	user.Status = status
	user.ReviewNote = strings.TrimSpace(note)
	user.ReviewedAt = &now
	if actor != nil {
		user.ReviewedBy = &actor.ID
	}
	return user, nil
}

func (s *AuthService) autoApproveSuperuserIfNeeded(ctx context.Context, user *model.User) (*model.User, error) {
	if user == nil {
		return nil, nil
	}
	if user.Status != model.UserStatusReviewPending {
		return user, nil
	}
	if !s.IsSuperuser(user) {
		return user, nil
	}

	now := time.Now().UTC()
	updates := map[string]any{
		"status":        model.UserStatusActive,
		"review_note":   "superuser auto-approved",
		"reviewed_at":   now,
		"last_login_at": now,
	}
	if err := s.db.WithContext(ctx).Model(user).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("failed to auto-approve superuser: %w", err)
	}
	user.Status = model.UserStatusActive
	user.ReviewNote = "superuser auto-approved"
	user.ReviewedAt = &now
	user.LastLoginAt = &now
	return user, nil
}

func validReviewTransition(current, next string) bool {
	switch next {
	case model.UserStatusActive:
		return current == model.UserStatusReviewPending || current == model.UserStatusRejected || current == model.UserStatusDisabled
	case model.UserStatusRejected:
		return current == model.UserStatusReviewPending
	case model.UserStatusDisabled:
		return current == model.UserStatusActive
	default:
		return false
	}
}

func (s *AuthService) emailOwnedByAnotherUser(ctx context.Context, currentUserID, email string) (bool, error) {
	if strings.TrimSpace(email) == "" {
		return false, nil
	}
	query := s.db.WithContext(ctx).Model(&model.User{}).
		Where("(LOWER(email) = ? OR LOWER(pending_email) = ?)", strings.ToLower(email), strings.ToLower(email))
	if strings.TrimSpace(currentUserID) != "" {
		query = query.Where("id <> ?", currentUserID)
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return false, fmt.Errorf("failed to check email binding ownership: %w", err)
	}
	return count > 0, nil
}

func (s *AuthService) regenerateActivation(ctx context.Context, user *model.User) error {
	code, err := generateActivationCode()
	if err != nil {
		return fmt.Errorf("failed to generate code: %w", err)
	}
	expiresAt := time.Now().Add(activationTTL)

	if err := s.db.WithContext(ctx).Model(user).Updates(map[string]any{
		"activation_code":       code,
		"activation_expires_at": expiresAt,
	}).Error; err != nil {
		return fmt.Errorf("failed to update activation: %w", err)
	}
	if s.emailService != nil {
		if err := s.emailService.SendActivationEmail(user.Email, code); err != nil {
			return fmt.Errorf("failed to send activation email: %w", err)
		}
	}
	return nil
}

func randomHex(size int) (string, error) {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func generateActivationCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%0*d", activationCodeLen, n.Int64()), nil
}

func handleFromEmail(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) == 0 {
		return "user"
	}
	h := strings.ReplaceAll(parts[0], ".", "-")
	h = strings.ReplaceAll(h, "+", "-")
	if h == "" {
		return "user"
	}
	return h
}
