package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/database"
	"github.com/openclaw/clawhub/backend/internal/handler"
	"github.com/openclaw/clawhub/backend/internal/middleware"
	"github.com/openclaw/clawhub/backend/internal/service"
	"github.com/sirupsen/logrus"
)

func main() {
	// Setup logger
	logger := logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{})
	logger.SetOutput(os.Stdout)
	logger.SetLevel(logrus.InfoLevel)

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatalf("Failed to load config: %v", err)
	}

	// Initialize database
	db, err := database.NewDB(cfg.Database.URL, cfg.Database.MaxConnections)
	if err != nil {
		logger.Fatalf("Failed to connect to database: %v", err)
	}

	// Verify database connection
	if err := database.VerifyConnection(db); err != nil {
		logger.Fatalf("Failed to verify database connection: %v", err)
	}

	// Verify pg_trgm extension
	if err := database.VerifyPgTrgm(db); err != nil {
		logger.Fatalf("pg_trgm extension not available: %v", err)
	}

	// Initialize storage service
	storageService, err := service.NewOSSStorageService(cfg.OSS)
	if err != nil {
		logger.Fatalf("Failed to initialize storage service: %v", err)
	}

	// Initialize services
	skillService := service.NewSkillService(db, storageService)
	zipService := service.NewZipService(storageService)
	authService := service.NewAuthServiceWithConfig(db, cfg.Auth)
	gitlabImportService, err := service.NewGitLabImportService(cfg.Auth.GitLab)
	if err != nil {
		logger.Fatalf("Failed to initialize gitlab import service: %v", err)
	}
	superuserProviderCount := len(cfg.Auth.Superusers.Providers)
	superuserMatchCount := 0
	for _, provider := range cfg.Auth.Superusers.Providers {
		superuserMatchCount += len(provider.Emails) + len(provider.Subjects)
	}
	logger.Infof(
		"Configured %d superuser provider entries (%d match values)",
		superuserProviderCount,
		superuserMatchCount,
	)

	if cfg.Auth.SMTP.Host != "" {
		emailService := service.NewEmailService(cfg.Auth.SMTP)
		authService.SetEmailAuth(cfg.Auth.AllowedEmailDomains, emailService)
		logger.Infof("Email auth enabled (domains: %v)", cfg.Auth.AllowedEmailDomains)
	} else {
		logger.Warn("SMTP not configured — email registration disabled")
	}

	// Setup Gin router
	router := gin.Default()
	router.Use(middleware.CORS([]string{cfg.Auth.FrontendURL}))

	// Register routes
	handler.RegisterRoutes(router, skillService, zipService, authService, gitlabImportService, cfg)

	// Create HTTP server
	srv := &http.Server{
		Addr:    ":" + cfg.Server.Port,
		Handler: router,
	}

	// Start server in goroutine
	go func() {
		logger.Infof("Starting server on port %s", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatalf("Server forced to shutdown: %v", err)
	}

	logger.Info("Server exited")
}
