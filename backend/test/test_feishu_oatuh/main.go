package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	feishuTokenURL    = "https://open.feishu.cn/open-apis/authen/v2/oauth/token"
	feishuUserInfoURL = "https://open.feishu.cn/open-apis/authen/v1/user_info"
)

type tokenResponse struct {
	Code             int    `json:"code"`
	AccessToken      string `json:"access_token"`
	ExpiresIn        int    `json:"expires_in"`
	RefreshToken     string `json:"refresh_token"`
	TokenType        string `json:"token_type"`
	Scope            string `json:"scope"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type serverUserInfoResponse struct {
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

type clientUserInfoPayload struct {
	UserInfo struct {
		NickName  string `json:"nickName"`
		AvatarURL string `json:"avatarUrl"`
		Gender    string `json:"gender"`
		Country   string `json:"country"`
		City      string `json:"city"`
		Language  string `json:"language"`
	} `json:"userInfo"`
	RawData       string `json:"rawData"`
	Signature     string `json:"signature"`
	EncryptedData string `json:"encryptedData"`
	IV            string `json:"iv"`
	ErrMsg        string `json:"errMsg"`
}

func main() {
	var (
		mode          = flag.String("mode", "all", "test mode: all|server|client")
		clientJSON    = flag.String("client-json", "", "path to tt.getUserInfo returned JSON file")
		authCode      = flag.String("code", strings.TrimSpace(os.Getenv("FEISHU_AUTH_CODE")), "feishu authorization code")
		redirectURI   = flag.String("redirect-uri", strings.TrimSpace(os.Getenv("FEISHU_REDIRECT_URI")), "redirect_uri used when exchanging code")
		userToken     = flag.String("user-token", strings.TrimSpace(os.Getenv("FEISHU_USER_ACCESS_TOKEN")), "user_access_token; if empty script will try code exchange")
		appID         = flag.String("app-id", strings.TrimSpace(os.Getenv("FEISHU_APP_ID")), "feishu app id")
		appSecret     = flag.String("app-secret", strings.TrimSpace(os.Getenv("FEISHU_APP_SECRET")), "feishu app secret")
		requestTimout = flag.Duration("timeout", 20*time.Second, "http timeout")
	)
	flag.Parse()

	client := &http.Client{Timeout: *requestTimout}

	switch *mode {
	case "all":
		if err := testServerUserInfo(client, *appID, *appSecret, *authCode, *redirectURI, *userToken); err != nil {
			fmt.Fprintf(os.Stderr, "\n[server_user_info] failed: %v\n", err)
		}
		if err := testClientUserInfo(*clientJSON); err != nil {
			fmt.Fprintf(os.Stderr, "\n[client_get_user_info] failed: %v\n", err)
		}
	case "server":
		must(testServerUserInfo(client, *appID, *appSecret, *authCode, *redirectURI, *userToken))
	case "client":
		must(testClientUserInfo(*clientJSON))
	default:
		must(fmt.Errorf("unsupported mode: %s", *mode))
	}
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func testServerUserInfo(client *http.Client, appID, appSecret, authCode, redirectURI, userToken string) error {
	fmt.Println("== Server API: /open-apis/authen/v1/user_info ==")

	accessToken := strings.TrimSpace(userToken)
	if accessToken == "" {
		if strings.TrimSpace(appID) == "" || strings.TrimSpace(appSecret) == "" || strings.TrimSpace(authCode) == "" {
			return errors.New("missing token; provide -user-token or FEISHU_USER_ACCESS_TOKEN, or provide -app-id/-app-secret/-code for token exchange")
		}
		tokenResp, err := exchangeCode(client, appID, appSecret, authCode, redirectURI)
		if err != nil {
			return err
		}
		accessToken = tokenResp.AccessToken
		fmt.Printf("token exchange ok: token_type=%s scope=%s expires_in=%d\n", tokenResp.TokenType, tokenResp.Scope, tokenResp.ExpiresIn)
	}

	resp, err := fetchServerUserInfo(client, accessToken)
	if err != nil {
		return err
	}

	prettyPrint(resp)
	fmt.Println()
	fmt.Printf("email=%q\n", strings.TrimSpace(resp.Data.Email))
	fmt.Printf("enterprise_email=%q\n", strings.TrimSpace(resp.Data.EnterpriseEmail))
	fmt.Printf("open_id=%q\n", strings.TrimSpace(resp.Data.OpenID))
	fmt.Printf("union_id=%q\n", strings.TrimSpace(resp.Data.UnionID))
	fmt.Printf("tenant_key=%q\n", strings.TrimSpace(resp.Data.TenantKey))

	if strings.TrimSpace(resp.Data.Email) == "" && strings.TrimSpace(resp.Data.EnterpriseEmail) == "" {
		fmt.Println("result: no email field returned from server API")
	} else {
		fmt.Println("result: server API returned email-related field")
	}

	return nil
}

func testClientUserInfo(clientJSON string) error {
	fmt.Println("== Client JSAPI: tt.getUserInfo ==")
	if strings.TrimSpace(clientJSON) == "" {
		fmt.Println("skip: no client JSON provided")
		fmt.Println("hint: capture tt.getUserInfo(...) result in browser console and save it to a JSON file, then rerun with -client-json path/to/file.json")
		fmt.Println("note: for web apps, docs state withCredentials is not supported; sensitive fields like email are not directly exposed in plaintext")
		return nil
	}

	raw, err := os.ReadFile(filepath.Clean(clientJSON))
	if err != nil {
		return fmt.Errorf("read client json failed: %w", err)
	}

	var payload clientUserInfoPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return fmt.Errorf("decode client json failed: %w", err)
	}

	prettyPrint(payload)
	fmt.Println()
	fmt.Printf("nickName=%q\n", strings.TrimSpace(payload.UserInfo.NickName))
	fmt.Printf("rawData_present=%v\n", strings.TrimSpace(payload.RawData) != "")
	fmt.Printf("encryptedData_present=%v\n", strings.TrimSpace(payload.EncryptedData) != "")
	fmt.Printf("iv_present=%v\n", strings.TrimSpace(payload.IV) != "")

	rawLower := strings.ToLower(payload.RawData)
	switch {
	case strings.Contains(rawLower, "email"):
		fmt.Println("result: rawData appears to contain email-like key")
	case strings.TrimSpace(payload.EncryptedData) != "":
		fmt.Println("result: client payload contains encryptedData, but email is not directly visible in plaintext")
	default:
		fmt.Println("result: client payload does not expose email in plaintext")
	}

	return nil
}

func exchangeCode(client *http.Client, appID, appSecret, code, redirectURI string) (*tokenResponse, error) {
	payload := map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     strings.TrimSpace(appID),
		"client_secret": strings.TrimSpace(appSecret),
		"code":          strings.TrimSpace(code),
	}
	if strings.TrimSpace(redirectURI) != "" {
		payload["redirect_uri"] = strings.TrimSpace(redirectURI)
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal token request failed: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, feishuTokenURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create token request failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token exchange request failed: %w", err)
	}
	defer resp.Body.Close()

	var result tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode token response failed: %w", err)
	}
	if resp.StatusCode != http.StatusOK || result.Code != 0 || strings.TrimSpace(result.AccessToken) == "" {
		return nil, fmt.Errorf("token exchange failed: status=%d code=%d error=%s description=%s", resp.StatusCode, result.Code, result.Error, result.ErrorDescription)
	}
	return &result, nil
}

func fetchServerUserInfo(client *http.Client, accessToken string) (*serverUserInfoResponse, error) {
	req, err := http.NewRequest(http.MethodGet, feishuUserInfoURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create user info request failed: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(accessToken))

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("user info request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read user info response failed: %w", err)
	}

	var result serverUserInfoResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode user info response failed: %w body=%s", err, string(body))
	}
	if resp.StatusCode != http.StatusOK || result.Code != 0 {
		return nil, fmt.Errorf("user info request failed: status=%d code=%d msg=%s body=%s", resp.StatusCode, result.Code, result.Msg, string(body))
	}
	return &result, nil
}

func prettyPrint(value any) {
	buf, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		fmt.Printf("%+v\n", value)
		return
	}
	fmt.Println(string(buf))
}
