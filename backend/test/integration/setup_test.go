package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/database"
	"github.com/openclaw/clawhub/backend/internal/handler"
	"github.com/openclaw/clawhub/backend/internal/middleware"
	"github.com/openclaw/clawhub/backend/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// TestServer wraps the HTTP server for testing
type TestServer struct {
	Router         *gin.Engine
	DB             *gorm.DB
	SkillService   *service.SkillService
	StorageService service.StorageService
	AuthService    *service.AuthService
	Config         *config.Config
}

// NewTestServer creates a new test server instance
func NewTestServer(t *testing.T) *TestServer {
	authConfig := config.AuthConfig{
		JWTSecret:   "test-jwt-secret",
		FrontendURL: "http://localhost:10091",
	}
	return NewTestServerWithAuthConfig(t, authConfig)
}

func NewTestServerWithAuthConfig(t *testing.T, authConfig config.AuthConfig) *TestServer {
	// Load config
	cfg, err := config.Load()
	require.NoError(t, err, "Failed to load config")

	// Connect to database
	db, err := database.NewDB(cfg.Database.URL, cfg.Database.MaxConnections)
	require.NoError(t, err, "Failed to connect to database")

	// Verify database connection
	err = database.VerifyConnection(db)
	require.NoError(t, err, "Failed to verify database connection")

	// Verify pg_trgm extension
	err = database.VerifyPgTrgm(db)
	require.NoError(t, err, "pg_trgm extension not available")

	// Initialize storage service (mock for testing)
	storageService := NewMockStorageService()

	// Initialize services
	skillService := service.NewSkillService(db, storageService)
	zipService := service.NewZipService(storageService)
	authService := service.NewAuthServiceWithConfig(db, authConfig)
	gitlabImportService, err := service.NewGitLabImportService(cfg.Auth.GitLab)
	require.NoError(t, err, "Failed to initialize gitlab import service")

	// Setup Gin router
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.CORS())

	// Register routes
	handler.RegisterRoutes(router, skillService, zipService, authService, gitlabImportService, cfg)

	return &TestServer{
		Router:         router,
		DB:             db,
		SkillService:   skillService,
		StorageService: storageService,
		AuthService:    authService,
		Config:         cfg,
	}
}

// CleanupDatabase removes all test data
func (ts *TestServer) CleanupDatabase(t *testing.T) {
	// Delete in correct order due to foreign keys
	err := ts.DB.Exec("DELETE FROM skill_versions").Error
	require.NoError(t, err, "Failed to cleanup skill_versions")

	err = ts.DB.Exec("DELETE FROM skills").Error
	require.NoError(t, err, "Failed to cleanup skills")
}

func (ts *TestServer) CleanupAuthTables(t *testing.T) {
	err := ts.DB.Exec("DELETE FROM api_tokens").Error
	require.NoError(t, err, "Failed to cleanup api_tokens")

	err = ts.DB.Exec("DELETE FROM auth_identities").Error
	require.NoError(t, err, "Failed to cleanup auth_identities")

	err = ts.DB.Exec("DELETE FROM users").Error
	require.NoError(t, err, "Failed to cleanup users")
}

func (ts *TestServer) EnsureAuthSchema(t *testing.T) {
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_code TEXT
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_expires_at TIMESTAMPTZ
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'github'
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT NOT NULL DEFAULT ''
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS has_bound_email BOOLEAN NOT NULL DEFAULT FALSE
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewed_by UUID
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT ''
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE users ALTER COLUMN github_id DROP NOT NULL
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		CREATE TABLE IF NOT EXISTS auth_identities (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			provider TEXT NOT NULL,
			provider_subject TEXT NOT NULL,
			provider_username TEXT NOT NULL DEFAULT '',
			provider_email TEXT NOT NULL DEFAULT '',
			provider_avatar_url TEXT NOT NULL DEFAULT '',
			provider_open_id TEXT NOT NULL DEFAULT '',
			provider_union_id TEXT NOT NULL DEFAULT '',
			provider_tenant_key TEXT NOT NULL DEFAULT '',
			raw_claims JSONB,
			last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE(provider, provider_subject)
		)
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS provider_open_id TEXT NOT NULL DEFAULT ''
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS provider_union_id TEXT NOT NULL DEFAULT ''
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS provider_tenant_key TEXT NOT NULL DEFAULT ''
	`).Error)
	require.NoError(t, ts.DB.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS users_pending_email_unique ON users(pending_email) WHERE pending_email != ''
	`).Error)
}

func (ts *TestServer) EnsureSkillSchema(t *testing.T) {
	require.NoError(t, ts.DB.Exec(`
		ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_highlighted BOOLEAN NOT NULL DEFAULT FALSE
	`).Error)
}

// DoRequest performs an HTTP request and returns the response
func (ts *TestServer) DoRequest(method, path string, body io.Reader) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	ts.Router.ServeHTTP(w, req)
	return w
}

func (ts *TestServer) DoAuthenticatedRequest(method, path string, body io.Reader, sessionToken string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.AddCookie(&http.Cookie{Name: "clawhub_session", Value: sessionToken})
	w := httptest.NewRecorder()
	ts.Router.ServeHTTP(w, req)
	return w
}

// DoMultipartRequest performs a multipart form request
func (ts *TestServer) DoMultipartRequest(path string, payload interface{}, files map[string]string) *httptest.ResponseRecorder {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add payload as a file (not a field)
	payloadJSON, _ := json.Marshal(payload)
	payloadPart, _ := writer.CreateFormFile("payload", "payload.json")
	_, _ = payloadPart.Write(payloadJSON)

	// Add files
	for filename, content := range files {
		part, _ := writer.CreateFormFile("files", filename)
		_, _ = part.Write([]byte(content))
	}

	_ = writer.Close()

	req := httptest.NewRequest("POST", path, body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	ts.Router.ServeHTTP(w, req)
	return w
}

func (ts *TestServer) DoAuthenticatedMultipartRequest(
	path string,
	payload interface{},
	files map[string]string,
	sessionToken string,
	payloadAsField bool,
) *httptest.ResponseRecorder {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	payloadJSON, _ := json.Marshal(payload)
	if payloadAsField {
		_ = writer.WriteField("payload", string(payloadJSON))
	} else {
		payloadPart, _ := writer.CreateFormFile("payload", "payload.json")
		_, _ = payloadPart.Write(payloadJSON)
	}

	for filename, content := range files {
		part, _ := writer.CreateFormFile("files", filename)
		_, _ = part.Write([]byte(content))
	}

	_ = writer.Close()

	req := httptest.NewRequest("POST", path, body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: "clawhub_session", Value: sessionToken})
	w := httptest.NewRecorder()
	ts.Router.ServeHTTP(w, req)
	return w
}

func (ts *TestServer) DoBearerMultipartRequest(
	method string,
	path string,
	payload interface{},
	files map[string]string,
	token string,
	payloadAsField bool,
) *httptest.ResponseRecorder {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	payloadJSON, _ := json.Marshal(payload)
	if payloadAsField {
		_ = writer.WriteField("payload", string(payloadJSON))
	} else {
		payloadPart, _ := writer.CreateFormFile("payload", "payload.json")
		_, _ = payloadPart.Write(payloadJSON)
	}

	for filename, content := range files {
		part, _ := writer.CreateFormFile("files", filename)
		_, _ = part.Write([]byte(content))
	}

	_ = writer.Close()

	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	ts.Router.ServeHTTP(w, req)
	return w
}

// MockStorageService implements StorageService for testing
type MockStorageService struct {
	files map[string][]byte
	mu    sync.Mutex
}

func NewMockStorageService() *MockStorageService {
	return &MockStorageService{
		files: make(map[string][]byte),
	}
}

func (m *MockStorageService) Upload(ctx context.Context, key string, reader io.Reader, contentType string) error {
	data, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.files[key] = data
	m.mu.Unlock()
	return nil
}

func (m *MockStorageService) UploadWithHash(ctx context.Context, key string, reader io.Reader, contentType string) (string, error) {
	err := m.Upload(ctx, key, reader, contentType)
	if err != nil {
		return "", err
	}
	// Return a mock hash
	return fmt.Sprintf("mock-hash-%s", key), nil
}

func (m *MockStorageService) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	m.mu.Lock()
	data, exists := m.files[key]
	m.mu.Unlock()
	if !exists {
		return nil, fmt.Errorf("file not found: %s", key)
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

func (m *MockStorageService) Delete(ctx context.Context, key string) error {
	m.mu.Lock()
	delete(m.files, key)
	m.mu.Unlock()
	return nil
}

func (m *MockStorageService) SetFile(key string, data []byte) {
	m.mu.Lock()
	m.files[key] = data
	m.mu.Unlock()
}

// Helper functions for assertions

func AssertJSONResponse(t *testing.T, w *httptest.ResponseRecorder, expectedStatus int, target interface{}) {
	assert.Equal(t, expectedStatus, w.Code, "Status code mismatch")
	assert.Equal(t, "application/json; charset=utf-8", w.Header().Get("Content-Type"), "Content-Type mismatch")

	if target != nil {
		err := json.Unmarshal(w.Body.Bytes(), target)
		require.NoError(t, err, "Failed to unmarshal response")
	}
}

func CreateTestSkillFiles() map[string]string {
	return map[string]string{
		"skill.md": `---
name: test-skill
description: A test skill
tags: [test, example]
---

# Test Skill

This is a test skill for integration testing.
`,
		"commands/hello.md": `---
name: hello
description: Say hello
---

# Hello Command

Prints a greeting message.
`,
	}
}
