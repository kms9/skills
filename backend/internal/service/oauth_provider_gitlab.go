package service

import (
	"context"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/openclaw/clawhub/backend/internal/config"
)

type GitLabOIDCProvider struct {
	config      config.GitLabProviderConfig
	client      *http.Client
	mu          sync.Mutex
	discovery   *gitLabDiscovery
	jwks        *gitLabJWKS
	jwksFetched time.Time
}

type gitLabDiscovery struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
	JWKSURI               string `json:"jwks_uri"`
}

type gitLabJWKS struct {
	Keys []gitLabJWK `json:"keys"`
}

type gitLabJWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func NewGitLabOIDCProvider(cfg config.GitLabProviderConfig) (*GitLabOIDCProvider, error) {
	client := http.DefaultClient
	if cfg.CACertFile != "" {
		pemBytes, err := os.ReadFile(cfg.CACertFile)
		if err != nil {
			return nil, fmt.Errorf("read gitlab ca cert: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pemBytes) {
			return nil, fmt.Errorf("invalid gitlab ca cert bundle")
		}
		client = &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{RootCAs: pool},
			},
			Timeout: 15 * time.Second,
		}
	}

	return &GitLabOIDCProvider{
		config: cfg,
		client: client,
	}, nil
}

func (p *GitLabOIDCProvider) Name() string { return "gitlab" }
func (p *GitLabOIDCProvider) Enabled() bool {
	return p.config.Enabled && p.config.ClientID != "" && p.config.ClientSecret != "" && p.config.BaseURL != ""
}
func (p *GitLabOIDCProvider) UsesNonce() bool { return true }

func (p *GitLabOIDCProvider) BuildAuthURL(input AuthRequestInput) (string, error) {
	discovery, err := p.getDiscovery(context.Background())
	if err != nil {
		return "", err
	}

	scopes := p.config.Scopes
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}

	params := url.Values{}
	params.Set("client_id", p.config.ClientID)
	params.Set("redirect_uri", input.RedirectURI)
	params.Set("response_type", "code")
	params.Set("scope", strings.Join(scopes, " "))
	params.Set("state", input.State)
	params.Set("nonce", input.Nonce)
	return discovery.AuthorizationEndpoint + "?" + params.Encode(), nil
}

func (p *GitLabOIDCProvider) ExchangeCode(ctx context.Context, input ExchangeCodeInput) (*ExternalTokenSet, error) {
	discovery, err := p.getDiscovery(ctx)
	if err != nil {
		return nil, err
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", p.config.ClientID)
	form.Set("client_secret", p.config.ClientSecret)
	form.Set("code", input.Code)
	form.Set("redirect_uri", input.RedirectURI)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, discovery.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gitlab token exchange failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gitlab token exchange failed with status %d", resp.StatusCode)
	}

	var payload struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		IDToken     string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode gitlab token response: %w", err)
	}
	if payload.AccessToken == "" {
		return nil, fmt.Errorf("gitlab access token missing")
	}

	return &ExternalTokenSet{
		AccessToken: payload.AccessToken,
		TokenType:   payload.TokenType,
		IDToken:     payload.IDToken,
		Raw: map[string]any{
			"token_type": payload.TokenType,
		},
	}, nil
}

func (p *GitLabOIDCProvider) FetchIdentity(ctx context.Context, tokenSet *ExternalTokenSet, expectedNonce string) (*ExternalIdentity, error) {
	discovery, err := p.getDiscovery(ctx)
	if err != nil {
		return nil, err
	}
	if tokenSet.IDToken == "" {
		return nil, fmt.Errorf("gitlab id token missing")
	}
	if _, err := p.validateIDToken(ctx, tokenSet.IDToken, expectedNonce); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discovery.UserinfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tokenSet.AccessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gitlab userinfo request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gitlab userinfo failed with status %d", resp.StatusCode)
	}

	var claims map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&claims); err != nil {
		return nil, fmt.Errorf("decode gitlab userinfo: %w", err)
	}

	username, _ := claims["preferred_username"].(string)
	name, _ := claims["name"].(string)
	email, _ := claims["email"].(string)
	picture, _ := claims["picture"].(string)
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return nil, fmt.Errorf("gitlab userinfo missing sub")
	}

	groups := extractStringSlice(claims["groups"])
	if len(p.config.AllowedGroups) > 0 && !intersects(groups, p.config.AllowedGroups) {
		return nil, fmt.Errorf("gitlab user is not in an allowed group")
	}

	var emailVerified *bool
	if value, ok := claims["email_verified"].(bool); ok {
		emailVerified = &value
	}

	return &ExternalIdentity{
		Provider:      p.Name(),
		Subject:       sub,
		Username:      username,
		DisplayName:   name,
		Email:         email,
		AvatarURL:     picture,
		EmailVerified: emailVerified,
		Groups:        groups,
		RawClaims:     claims,
	}, nil
}

func (p *GitLabOIDCProvider) getDiscovery(ctx context.Context) (*gitLabDiscovery, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.discovery != nil {
		return p.discovery, nil
	}

	discoveryURL := strings.TrimSpace(p.config.DiscoveryURL)
	if discoveryURL == "" {
		discoveryURL = strings.TrimRight(p.config.BaseURL, "/") + "/.well-known/openid-configuration"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discoveryURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gitlab discovery failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gitlab discovery failed with status %d", resp.StatusCode)
	}

	var discovery gitLabDiscovery
	if err := json.NewDecoder(resp.Body).Decode(&discovery); err != nil {
		return nil, fmt.Errorf("decode gitlab discovery: %w", err)
	}
	p.discovery = &discovery
	return p.discovery, nil
}

func (p *GitLabOIDCProvider) getJWKS(ctx context.Context) (*gitLabJWKS, error) {
	p.mu.Lock()
	if p.jwks != nil && time.Since(p.jwksFetched) < 15*time.Minute {
		defer p.mu.Unlock()
		return p.jwks, nil
	}
	p.mu.Unlock()

	discovery, err := p.getDiscovery(ctx)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discovery.JWKSURI, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gitlab jwks failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gitlab jwks failed with status %d", resp.StatusCode)
	}

	var jwks gitLabJWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("decode gitlab jwks: %w", err)
	}

	p.mu.Lock()
	p.jwks = &jwks
	p.jwksFetched = time.Now()
	p.mu.Unlock()
	return &jwks, nil
}

func (p *GitLabOIDCProvider) validateIDToken(ctx context.Context, rawToken, expectedNonce string) (*jwt.RegisteredClaims, error) {
	discovery, err := p.getDiscovery(ctx)
	if err != nil {
		return nil, err
	}
	jwks, err := p.getJWKS(ctx)
	if err != nil {
		return nil, err
	}

	type idTokenClaims struct {
		Nonce string `json:"nonce"`
		jwt.RegisteredClaims
	}

	claims := &idTokenClaims{}
	token, err := jwt.ParseWithClaims(rawToken, claims, func(token *jwt.Token) (any, error) {
		kid, _ := token.Header["kid"].(string)
		for _, key := range jwks.Keys {
			if key.Kid != kid {
				continue
			}
			return rsaPublicKeyFromJWK(key)
		}
		return nil, fmt.Errorf("signing key not found")
	}, jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}))
	if err != nil {
		return nil, fmt.Errorf("validate gitlab id token: %w", err)
	}
	if !token.Valid {
		return nil, fmt.Errorf("gitlab id token invalid")
	}
	if claims.Issuer != discovery.Issuer {
		return nil, fmt.Errorf("gitlab id token issuer mismatch")
	}
	if !audienceContains(claims.Audience, p.config.ClientID) {
		return nil, fmt.Errorf("gitlab id token audience mismatch")
	}
	if expectedNonce != "" && claims.Nonce != expectedNonce {
		return nil, fmt.Errorf("gitlab id token nonce mismatch")
	}
	return &claims.RegisteredClaims, nil
}

func rsaPublicKeyFromJWK(jwk gitLabJWK) (*rsa.PublicKey, error) {
	if jwk.Kty != "RSA" {
		return nil, fmt.Errorf("unsupported jwk type %s", jwk.Kty)
	}
	nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
	if err != nil {
		return nil, err
	}
	eInt := big.NewInt(0).SetBytes(eBytes).Int64()
	return &rsa.PublicKey{
		N: big.NewInt(0).SetBytes(nBytes),
		E: int(eInt),
	}, nil
}

func extractStringSlice(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if text, ok := item.(string); ok && text != "" {
			result = append(result, text)
		}
	}
	return result
}

func intersects(a, b []string) bool {
	if len(a) == 0 || len(b) == 0 {
		return false
	}
	allowed := make(map[string]struct{}, len(b))
	for _, item := range b {
		allowed[item] = struct{}{}
	}
	for _, item := range a {
		if _, ok := allowed[item]; ok {
			return true
		}
	}
	return false
}

func audienceContains(audience jwt.ClaimStrings, expected string) bool {
	for _, value := range audience {
		if value == expected {
			return true
		}
	}
	return false
}
