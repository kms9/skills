package service

import (
	"testing"

	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/model"
)

func TestAuthServiceIsSuperuserByIdentitiesMatchesProviderConfig(t *testing.T) {
	service := &AuthService{
		superusers: config.SuperusersConfig{
			Providers: map[string]config.ProviderSuperuserConfig{
				"feishu": {
					Emails:   []string{"admin@example.com"},
					Subjects: []string{"ou_admin"},
				},
				"gitlab": {
					Emails: []string{"owner@gitlab.example.com"},
				},
			},
		},
	}

	cases := []struct {
		name       string
		user       *model.User
		identities []model.AuthIdentity
		want       bool
	}{
		{
			name: "matches configured provider email without bound email",
			user: &model.User{ID: "user-1"},
			identities: []model.AuthIdentity{
				{Provider: "feishu", ProviderEmail: "admin@example.com"},
			},
			want: true,
		},
		{
			name: "matches configured provider subject",
			user: &model.User{ID: "user-2"},
			identities: []model.AuthIdentity{
				{Provider: "feishu", ProviderSubject: "ou_admin"},
			},
			want: true,
		},
		{
			name: "matches configured provider case-insensitive email",
			user: &model.User{ID: "user-3"},
			identities: []model.AuthIdentity{
				{Provider: "gitlab", ProviderEmail: "OWNER@GITLAB.EXAMPLE.COM"},
			},
			want: true,
		},
		{
			name: "no match",
			user: &model.User{ID: "user-4"},
			identities: []model.AuthIdentity{
				{Provider: "feishu", ProviderEmail: "user@example.com", ProviderSubject: "ou_user"},
			},
			want: false,
		},
		{
			name: "nil user",
			user: nil,
			identities: []model.AuthIdentity{
				{Provider: "feishu", ProviderEmail: "admin@example.com"},
			},
			want: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := service.IsSuperuserByIdentities(tc.user, tc.identities); got != tc.want {
				t.Fatalf("IsSuperuserByIdentities() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestAuthServiceHasManagementAccessDoesNotRequireBoundEmail(t *testing.T) {
	service := &AuthService{}

	if !service.HasManagementAccess(&model.User{Role: "moderator"}) {
		t.Fatalf("expected moderator to have management access without bound email")
	}
	if service.HasManagementAccess(nil) {
		t.Fatalf("expected nil user to have no management access")
	}
}

func TestAuthServiceEnsureLoginAllowed(t *testing.T) {
	service := &AuthService{}
	cases := []struct {
		status string
		want   error
	}{
		{status: model.UserStatusActive, want: nil},
		{status: model.UserStatusEmailPending, want: ErrAccountEmailPending},
		{status: model.UserStatusReviewPending, want: ErrAccountReviewPending},
		{status: model.UserStatusRejected, want: ErrAccountRejected},
		{status: model.UserStatusDisabled, want: ErrAccountDisabled},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			err := service.EnsureLoginAllowed(&model.User{Status: tc.status})
			if err != tc.want {
				t.Fatalf("EnsureLoginAllowed() error = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestAuthServiceInitialStatusForIdentity(t *testing.T) {
	service := &AuthService{}

	if got := service.initialStatusForIdentity(&ExternalIdentity{Provider: "feishu"})("", ""); got != model.UserStatusActive {
		t.Fatalf("feishu initial status = %s, want %s", got, model.UserStatusActive)
	}

	if got := service.initialStatusForIdentity(&ExternalIdentity{Provider: "github"})("", ""); got != model.UserStatusReviewPending {
		t.Fatalf("github initial status = %s, want %s", got, model.UserStatusReviewPending)
	}

	if got := service.initialStatusForCandidate("super@example.com", "superuserlogo"); got != model.UserStatusReviewPending {
		t.Fatalf("email candidate initial status = %s, want %s", got, model.UserStatusReviewPending)
	}
}

func TestFeishuFirstLoginStatusAllowsLogin(t *testing.T) {
	service := &AuthService{}

	status := service.initialStatusForIdentity(&ExternalIdentity{Provider: "feishu"})("", "")
	if status != model.UserStatusActive {
		t.Fatalf("feishu initial status = %s, want %s", status, model.UserStatusActive)
	}

	if err := service.EnsureLoginAllowed(&model.User{Status: status}); err != nil {
		t.Fatalf("EnsureLoginAllowed() error = %v, want nil", err)
	}
}
