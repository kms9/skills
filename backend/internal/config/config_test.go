package config

import "testing"

func TestLoadUsesLocalByDefault(t *testing.T) {
	t.Setenv("GO_ENV", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Environment != "local" {
		t.Fatalf("expected environment local, got %s", cfg.Environment)
	}
}

func TestLoadUsesRequestedEnvironment(t *testing.T) {
	t.Setenv("GO_ENV", "test")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Environment != "test" {
		t.Fatalf("expected environment test, got %s", cfg.Environment)
	}
}

func TestEnvironmentVariablesOverrideConfig(t *testing.T) {
	t.Setenv("GO_ENV", "test")
	t.Setenv("DATABASE_URL", "postgres://override")
	t.Setenv("JWT_SECRET", "jwt-override")
	t.Setenv("FRONTEND_URL", "https://frontend.example.com")
	t.Setenv("OAUTH_PUBLIC_BASE_URL", "https://oauth.example.com")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Database.URL != "postgres://override" {
		t.Fatalf("expected DATABASE_URL override to apply, got %s", cfg.Database.URL)
	}
	if cfg.Auth.JWTSecret != "jwt-override" {
		t.Fatalf("expected JWT_SECRET override to apply, got %s", cfg.Auth.JWTSecret)
	}
	if cfg.Auth.FrontendURL != "https://frontend.example.com" {
		t.Fatalf("expected FRONTEND_URL override to apply, got %s", cfg.Auth.FrontendURL)
	}
	if cfg.Auth.OAuthPublicBaseURL != "https://oauth.example.com" {
		t.Fatalf("expected OAUTH_PUBLIC_BASE_URL override to apply, got %s", cfg.Auth.OAuthPublicBaseURL)
	}
}

func TestSuperusersJSONOverrideUsesProviderStructure(t *testing.T) {
	t.Setenv("GO_ENV", "test")
	t.Setenv("AUTH_SUPERUSERS_JSON", `{"providers":{"feishu":{"emails":["admin@example.com"],"subjects":["ou_xxx"]},"gitlab":{"emails":["owner@example.com"]}}}`)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	feishu, ok := cfg.Auth.Superusers.Providers["feishu"]
	if !ok {
		t.Fatalf("expected feishu provider config to exist")
	}
	if len(feishu.Emails) != 1 || feishu.Emails[0] != "admin@example.com" {
		t.Fatalf("unexpected feishu emails: %#v", feishu.Emails)
	}
	if len(feishu.Subjects) != 1 || feishu.Subjects[0] != "ou_xxx" {
		t.Fatalf("unexpected feishu subjects: %#v", feishu.Subjects)
	}

	gitlab, ok := cfg.Auth.Superusers.Providers["gitlab"]
	if !ok {
		t.Fatalf("expected gitlab provider config to exist")
	}
	if len(gitlab.Emails) != 1 || gitlab.Emails[0] != "owner@example.com" {
		t.Fatalf("unexpected gitlab emails: %#v", gitlab.Emails)
	}
}
