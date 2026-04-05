package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/sirupsen/logrus"
)

const (
	feishuAuthorizeURL = "https://accounts.feishu.cn/open-apis/authen/v1/authorize"
	feishuTokenURL     = "https://open.feishu.cn/open-apis/authen/v2/oauth/token"
	feishuUserInfoURL  = "https://open.feishu.cn/open-apis/authen/v1/user_info"
)

type FeishuProvider struct {
	config config.FeishuProviderConfig
	client *http.Client
}

func feishuDebugLoggingEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("FEISHU_DEBUG_LOG_FULL")), "true")
}

func NewFeishuProvider(cfg config.FeishuProviderConfig) *FeishuProvider {
	return &FeishuProvider{
		config: cfg,
		client: http.DefaultClient,
	}
}

func (p *FeishuProvider) Name() string { return "feishu" }

func (p *FeishuProvider) Enabled() bool {
	return p.config.Enabled && p.config.AppID != "" && p.config.AppSecret != ""
}

func (p *FeishuProvider) UsesNonce() bool { return false }

func (p *FeishuProvider) BuildAuthURL(input AuthRequestInput) (string, error) {
	params := url.Values{}
	params.Set("app_id", p.config.AppID)
	params.Set("redirect_uri", input.RedirectURI)
	params.Set("response_type", "code")
	params.Set("state", input.State)
	return feishuAuthorizeURL + "?" + params.Encode(), nil
}

func (p *FeishuProvider) ExchangeCode(ctx context.Context, input ExchangeCodeInput) (*ExternalTokenSet, error) {
	payload := map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     p.config.AppID,
		"client_secret": p.config.AppSecret,
		"code":          strings.TrimSpace(input.Code),
	}
	if strings.TrimSpace(input.RedirectURI) != "" {
		payload["redirect_uri"] = strings.TrimSpace(input.RedirectURI)
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to encode feishu token request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, feishuTokenURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("feishu token exchange failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read feishu token response: %w", err)
	}

	if feishuDebugLoggingEnabled() {
		logrus.WithFields(logrus.Fields{
			"http_status": resp.StatusCode,
			"response":    string(bodyBytes),
		}).Info("feishu token exchange raw response")
	}

	var result struct {
		Code             int    `json:"code"`
		AccessToken      string `json:"access_token"`
		ExpiresIn        int    `json:"expires_in"`
		RefreshToken     string `json:"refresh_token"`
		TokenType        string `json:"token_type"`
		Scope            string `json:"scope"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to decode feishu token response: %w", err)
	}
	if resp.StatusCode != http.StatusOK || result.Code != 0 || result.AccessToken == "" {
		return nil, fmt.Errorf("feishu token exchange failed: code=%d error=%s description=%s", result.Code, result.Error, result.ErrorDescription)
	}

	if feishuDebugLoggingEnabled() {
		logrus.WithFields(logrus.Fields{
			"access_token": result.AccessToken,
			"scope":        result.Scope,
			"token_type":   result.TokenType,
			"expires_in":   result.ExpiresIn,
		}).Info("feishu token exchange parsed response")
	}

	return &ExternalTokenSet{
		AccessToken: result.AccessToken,
		TokenType:   result.TokenType,
		Raw: map[string]any{
			"expires_in":    result.ExpiresIn,
			"refresh_token": result.RefreshToken,
			"scope":         result.Scope,
		},
	}, nil
}

func (p *FeishuProvider) FetchIdentity(ctx context.Context, tokenSet *ExternalTokenSet, _ string) (*ExternalIdentity, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feishuUserInfoURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tokenSet.AccessToken)

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch feishu user info: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read feishu user info response: %w", err)
	}

	if feishuDebugLoggingEnabled() {
		logrus.WithFields(logrus.Fields{
			"http_status": resp.StatusCode,
			"response":    string(bodyBytes),
		}).Info("feishu user info raw response")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("feishu user info error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			Name            string `json:"name"`
			EnName          string `json:"en_name"`
			AvatarURL       string `json:"avatar_url"`
			OpenID          string `json:"open_id"`
			UnionID         string `json:"union_id"`
			Email           string `json:"email"`
			EnterpriseEmail string `json:"enterprise_email"`
			UserID          string `json:"user_id"`
			Mobile          string `json:"mobile"`
			TenantKey       string `json:"tenant_key"`
			EmployeeNo      string `json:"employee_no"`
		} `json:"data"`
	}
	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to decode feishu user info: %w", err)
	}
	if result.Code != 0 {
		return nil, fmt.Errorf("failed to read feishu identity: code=%d msg=%s", result.Code, result.Msg)
	}

	email := strings.TrimSpace(result.Data.Email)
	if email == "" {
		email = strings.TrimSpace(result.Data.EnterpriseEmail)
	}
	subject := strings.TrimSpace(result.Data.UnionID)
	if subject == "" {
		subject = strings.TrimSpace(result.Data.OpenID)
	}
	username := strings.TrimSpace(result.Data.UserID)
	if username == "" {
		username = strings.TrimSpace(result.Data.OpenID)
	}

	return &ExternalIdentity{
		Provider:    p.Name(),
		Subject:     subject,
		Username:    username,
		DisplayName: strings.TrimSpace(result.Data.Name),
		Email:       email,
		AvatarURL:   strings.TrimSpace(result.Data.AvatarURL),
		OpenID:      strings.TrimSpace(result.Data.OpenID),
		UnionID:     strings.TrimSpace(result.Data.UnionID),
		TenantKey:   strings.TrimSpace(result.Data.TenantKey),
		RawClaims: map[string]any{
			"name":             result.Data.Name,
			"en_name":          result.Data.EnName,
			"avatar_url":       result.Data.AvatarURL,
			"open_id":          result.Data.OpenID,
			"union_id":         result.Data.UnionID,
			"email":            result.Data.Email,
			"enterprise_email": result.Data.EnterpriseEmail,
			"user_id":          result.Data.UserID,
			"mobile":           result.Data.Mobile,
			"tenant_key":       result.Data.TenantKey,
			"employee_no":      result.Data.EmployeeNo,
		},
	}, nil
}

func (p *FeishuProvider) ExchangeH5Code(ctx context.Context, code string) (*ExternalTokenSet, error) {
	return p.ExchangeCode(ctx, ExchangeCodeInput{Code: code})
}
