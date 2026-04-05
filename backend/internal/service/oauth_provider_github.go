package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/openclaw/clawhub/backend/internal/config"
)

type GitHubProvider struct {
	config config.OAuthProviderConfig
	client *http.Client
}

func NewGitHubProvider(cfg config.OAuthProviderConfig) *GitHubProvider {
	return &GitHubProvider{
		config: cfg,
		client: http.DefaultClient,
	}
}

func (p *GitHubProvider) Name() string { return "github" }
func (p *GitHubProvider) Enabled() bool {
	return p.config.Enabled && p.config.ClientID != "" && p.config.ClientSecret != ""
}
func (p *GitHubProvider) UsesNonce() bool { return false }

func (p *GitHubProvider) BuildAuthURL(input AuthRequestInput) (string, error) {
	params := url.Values{}
	params.Set("client_id", p.config.ClientID)
	params.Set("scope", "read:user,user:email")
	params.Set("state", input.State)
	if input.RedirectURI != "" {
		params.Set("redirect_uri", input.RedirectURI)
	}
	return "https://github.com/login/oauth/authorize?" + params.Encode(), nil
}

func (p *GitHubProvider) ExchangeCode(ctx context.Context, input ExchangeCodeInput) (*ExternalTokenSet, error) {
	params := url.Values{}
	params.Set("client_id", p.config.ClientID)
	params.Set("client_secret", p.config.ClientSecret)
	params.Set("code", input.Code)
	if input.RedirectURI != "" {
		params.Set("redirect_uri", input.RedirectURI)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://github.com/login/oauth/access_token",
		strings.NewReader(params.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode token response: %w", err)
	}
	if result.Error != "" {
		return nil, fmt.Errorf("github oauth error: %s", result.Error)
	}
	return &ExternalTokenSet{
		AccessToken: result.AccessToken,
		TokenType:   result.TokenType,
		Raw:         map[string]any{"token_type": result.TokenType},
	}, nil
}

func (p *GitHubProvider) FetchIdentity(ctx context.Context, tokenSet *ExternalTokenSet, _ string) (*ExternalIdentity, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tokenSet.AccessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch github user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("github api error %d: %s", resp.StatusCode, string(body))
	}

	var payload struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
		Email     string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("failed to decode github user: %w", err)
	}

	return &ExternalIdentity{
		Provider:    p.Name(),
		Subject:     fmt.Sprintf("%d", payload.ID),
		Username:    payload.Login,
		DisplayName: payload.Name,
		Email:       payload.Email,
		AvatarURL:   payload.AvatarURL,
		RawClaims: map[string]any{
			"id":         payload.ID,
			"login":      payload.Login,
			"name":       payload.Name,
			"avatar_url": payload.AvatarURL,
			"email":      payload.Email,
		},
	}, nil
}
