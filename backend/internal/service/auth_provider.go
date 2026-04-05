package service

import "context"

type AuthRedirect struct {
	URL   string
	State string
	Nonce string
}

type AuthRequestInput struct {
	RedirectURI string
	State       string
	Nonce       string
}

type ExchangeCodeInput struct {
	Code        string
	RedirectURI string
}

type ExternalTokenSet struct {
	AccessToken string
	TokenType   string
	IDToken     string
	Raw         map[string]any
}

type ExternalIdentity struct {
	Provider      string
	Subject       string
	Username      string
	DisplayName   string
	Email         string
	AvatarURL     string
	OpenID        string
	UnionID       string
	TenantKey     string
	EmailVerified *bool
	Groups        []string
	RawClaims     map[string]any
}

type IdentityProvider interface {
	Name() string
	Enabled() bool
	UsesNonce() bool
	BuildAuthURL(input AuthRequestInput) (string, error)
	ExchangeCode(ctx context.Context, input ExchangeCodeInput) (*ExternalTokenSet, error)
	FetchIdentity(ctx context.Context, tokenSet *ExternalTokenSet, expectedNonce string) (*ExternalIdentity, error)
}
