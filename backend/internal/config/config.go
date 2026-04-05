package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Environment string
	Server      ServerConfig
	Database    DatabaseConfig
	OSS         OSSConfig
	Auth        AuthConfig
}

type ServerConfig struct {
	Port string
}

type DatabaseConfig struct {
	URL            string
	MaxConnections int
}

type OSSConfig struct {
	Endpoint        string `mapstructure:"endpoint"`
	Bucket          string `mapstructure:"bucket"`
	Region          string `mapstructure:"region"`
	AccessKeyID     string `mapstructure:"access_key_id"`
	AccessKeySecret string `mapstructure:"access_key_secret"`
	UseInternal     bool   `mapstructure:"use_internal"`
}

type AuthConfig struct {
	GitHubClientID      string               `mapstructure:"github_client_id"`
	GitHubClientSecret  string               `mapstructure:"github_client_secret"`
	JWTSecret           string               `mapstructure:"jwt_secret"`
	FrontendURL         string               `mapstructure:"frontend_url"`
	OAuthPublicBaseURL  string               `mapstructure:"oauth_public_base_url"`
	AllowedEmailDomains []string             `mapstructure:"allowed_email_domains"`
	Superusers          SuperusersConfig     `mapstructure:"superusers"`
	GitHub              OAuthProviderConfig  `mapstructure:"github"`
	GitLab              GitLabProviderConfig `mapstructure:"gitlab"`
	Feishu              FeishuProviderConfig `mapstructure:"feishu"`
	SMTP                SMTPConfig
}

type SuperusersConfig struct {
	Providers map[string]ProviderSuperuserConfig `mapstructure:"providers"`
}

type ProviderSuperuserConfig struct {
	Emails   []string `mapstructure:"emails"`
	Subjects []string `mapstructure:"subjects"`
}

type OAuthProviderConfig struct {
	Enabled      bool   `mapstructure:"enabled"`
	ClientID     string `mapstructure:"client_id"`
	ClientSecret string `mapstructure:"client_secret"`
}

type GitLabProviderConfig struct {
	Enabled       bool     `mapstructure:"enabled"`
	BaseURL       string   `mapstructure:"base_url"`
	DiscoveryURL  string   `mapstructure:"discovery_url"`
	ClientID      string   `mapstructure:"client_id"`
	ClientSecret  string   `mapstructure:"client_secret"`
	ImportToken   string   `mapstructure:"import_token"`
	Scopes        []string `mapstructure:"scopes"`
	AllowedGroups []string `mapstructure:"allowed_groups"`
	CACertFile    string   `mapstructure:"ca_cert_file"`
}

type FeishuProviderConfig struct {
	Enabled   bool   `mapstructure:"enabled"`
	AppID     string `mapstructure:"app_id"`
	AppSecret string `mapstructure:"app_secret"`
}

type SMTPConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
	From     string `mapstructure:"from"`
	UseTLS   bool   `mapstructure:"use_tls"`
}

func Load() (*Config, error) {
	env := normalizeEnvironment(os.Getenv("GO_ENV"))
	v := viper.New()
	v.SetConfigType("yaml")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	v.SetDefault("server.port", "10081")
	v.SetDefault("database.max_connections", 25)
	v.SetDefault("oss.use_internal", false)
	v.SetDefault("auth.github.enabled", false)
	v.SetDefault("auth.gitlab.enabled", false)
	v.SetDefault("auth.feishu.enabled", false)
	v.SetDefault("auth.gitlab.scopes", []string{"openid", "profile", "email"})
	v.SetDefault("auth.frontend_url", "http://localhost:10091")
	v.SetDefault("auth.oauth_public_base_url", "")

	mustBindEnv(v, "server.port", "PORT")
	mustBindEnv(v, "database.url", "DATABASE_URL")
	mustBindEnv(v, "database.max_connections", "DATABASE_MAX_CONNECTIONS")
	mustBindEnv(v, "oss.endpoint", "OSS_ENDPOINT")
	mustBindEnv(v, "oss.bucket", "OSS_BUCKET")
	mustBindEnv(v, "oss.region", "OSS_REGION")
	mustBindEnv(v, "oss.access_key_id", "OSS_ACCESS_KEY_ID")
	mustBindEnv(v, "oss.access_key_secret", "OSS_ACCESS_KEY_SECRET")
	mustBindEnv(v, "oss.use_internal", "OSS_USE_INTERNAL")
	mustBindEnv(v, "auth.github_client_id", "GITHUB_CLIENT_ID")
	mustBindEnv(v, "auth.github_client_secret", "GITHUB_CLIENT_SECRET")
	mustBindEnv(v, "auth.jwt_secret", "JWT_SECRET")
	mustBindEnv(v, "auth.frontend_url", "FRONTEND_URL")
	mustBindEnv(v, "auth.oauth_public_base_url", "OAUTH_PUBLIC_BASE_URL")
	mustBindEnv(v, "auth.allowed_email_domains", "ALLOWED_EMAIL_DOMAINS")
	mustBindEnv(v, "auth.github.enabled", "GITHUB_ENABLED")
	mustBindEnv(v, "auth.github.client_id", "GITHUB_CLIENT_ID")
	mustBindEnv(v, "auth.github.client_secret", "GITHUB_CLIENT_SECRET")
	mustBindEnv(v, "auth.gitlab.enabled", "GITLAB_ENABLED")
	mustBindEnv(v, "auth.gitlab.base_url", "GITLAB_BASE_URL")
	mustBindEnv(v, "auth.gitlab.discovery_url", "GITLAB_DISCOVERY_URL")
	mustBindEnv(v, "auth.gitlab.client_id", "GITLAB_CLIENT_ID")
	mustBindEnv(v, "auth.gitlab.client_secret", "GITLAB_CLIENT_SECRET")
	mustBindEnv(v, "auth.gitlab.import_token", "GITLAB_IMPORT_TOKEN")
	mustBindEnv(v, "auth.gitlab.ca_cert_file", "GITLAB_CA_CERT_FILE")
	mustBindEnv(v, "auth.gitlab.allowed_groups", "GITLAB_ALLOWED_GROUPS")
	mustBindEnv(v, "auth.feishu.enabled", "FEISHU_ENABLED")
	mustBindEnv(v, "auth.feishu.app_id", "FEISHU_APP_ID")
	mustBindEnv(v, "auth.feishu.app_secret", "FEISHU_APP_SECRET")
	mustBindEnv(v, "auth.superusers_json", "AUTH_SUPERUSERS_JSON")
	mustBindEnv(v, "auth.smtp.host", "SMTP_HOST")
	mustBindEnv(v, "auth.smtp.port", "SMTP_PORT")
	mustBindEnv(v, "auth.smtp.username", "SMTP_USERNAME")
	mustBindEnv(v, "auth.smtp.password", "SMTP_PASSWORD")
	mustBindEnv(v, "auth.smtp.from", "SMTP_FROM")
	mustBindEnv(v, "auth.smtp.use_tls", "SMTP_USE_TLS")

	if err := mergeConfigFiles(v, env); err != nil {
		return nil, err
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}
	cfg.Environment = env

	if cfg.Auth.GitHub.ClientID == "" {
		cfg.Auth.GitHub.ClientID = cfg.Auth.GitHubClientID
	}
	if cfg.Auth.GitHub.ClientSecret == "" {
		cfg.Auth.GitHub.ClientSecret = cfg.Auth.GitHubClientSecret
	}
	if cfg.Auth.GitHub.ClientID != "" {
		cfg.Auth.GitHub.Enabled = true
	}
	if cfg.Auth.Feishu.AppID != "" {
		cfg.Auth.Feishu.Enabled = true
	}
	if raw := strings.TrimSpace(v.GetString("auth.superusers_json")); raw != "" {
		var superusers SuperusersConfig
		if err := json.Unmarshal([]byte(raw), &superusers); err != nil {
			return nil, fmt.Errorf("failed to parse auth.superusers_json: %w", err)
		}
		cfg.Auth.Superusers = superusers
	}
	if raw := strings.TrimSpace(v.GetString("auth.allowed_email_domains")); raw != "" {
		cfg.Auth.AllowedEmailDomains = splitCSV(raw)
	}
	if raw := strings.TrimSpace(v.GetString("auth.gitlab.allowed_groups")); raw != "" {
		cfg.Auth.GitLab.AllowedGroups = splitCSV(raw)
	}

	return &cfg, nil
}

func mergeConfigFiles(v *viper.Viper, env string) error {
	defaultLoaded := false
	envLoaded := false

	for _, dir := range configSearchDirs() {
		defaultPath := filepath.Join(dir, "default.yaml")
		if fileExists(defaultPath) {
			v.SetConfigFile(defaultPath)
			if err := v.MergeInConfig(); err != nil {
				return fmt.Errorf("failed to read default config %s: %w", defaultPath, err)
			}
			defaultLoaded = true
			break
		}
	}

	envFileName := fmt.Sprintf("%s.yaml", env)
	for _, dir := range configSearchDirs() {
		envPath := filepath.Join(dir, envFileName)
		if fileExists(envPath) {
			v.SetConfigFile(envPath)
			if err := v.MergeInConfig(); err != nil {
				return fmt.Errorf("failed to read env config %s: %w", envPath, err)
			}
			envLoaded = true
			break
		}
	}

	if !defaultLoaded && !envLoaded {
		return fmt.Errorf("no config files found for GO_ENV=%s (looked for default.yaml and %s in %v)", env, envFileName, configSearchDirs())
	}
	if !envLoaded {
		return fmt.Errorf("no environment config found for GO_ENV=%s (expected %s in %v)", env, envFileName, configSearchDirs())
	}

	return nil
}

func configSearchDirs() []string {
	return []string{
		"config",
		"backend/config",
		"./config",
		"./backend/config",
		"../config",
		"../backend/config",
		"../../config",
		"../../backend/config",
	}
}

func normalizeEnvironment(value string) string {
	env := strings.ToLower(strings.TrimSpace(value))
	if env == "" {
		return "local"
	}
	return env
}

func mustBindEnv(v *viper.Viper, key string, envNames ...string) {
	args := append([]string{key}, envNames...)
	if err := v.BindEnv(args...); err != nil {
		panic(fmt.Errorf("bind env %s failed: %w", key, err))
	}
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value != "" {
			items = append(items, value)
		}
	}
	return items
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
