package handler

import (
	"github.com/gin-gonic/gin"
	cfg "github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/middleware"
	"github.com/openclaw/clawhub/backend/internal/service"
)

func RegisterRoutes(
	router *gin.Engine,
	skillService *service.SkillService,
	zipService *service.ZipService,
	authService *service.AuthService,
	gitlabImportService *service.GitLabImportService,
	config *cfg.Config,
) {
	db := skillService.DB()
	requireAuth := middleware.RequireAuth(authService, db)
	optionalAuth := middleware.AuthMiddleware(authService, db)

	// Well-known endpoint
	router.GET("/.well-known/clawhub.json", WellKnownHandler(config))

	// Auth routes (no /api/v1 prefix)
	auth := router.Group("/auth")
	{
		auth.POST("/register", RegisterHandler(authService))
		auth.POST("/activate", ActivateHandler(authService))
		auth.POST("/login", EmailLoginHandler(authService))
		auth.POST("/resend-activation", ResendActivationHandler(authService))
		auth.GET("/feishu", OAuthLoginHandler("feishu", authService))
		auth.GET("/feishu/callback", OAuthCallbackHandler("feishu", authService))
		auth.POST("/feishu/h5-login", FeishuH5LoginHandler(authService))
		auth.POST("/feishu/bind", requireAuth, FeishuBindHandler(authService))
		auth.GET("/feishu/bind", requireAuth, FeishuBindLoginHandler(authService))
		auth.GET("/feishu/bind/callback", requireAuth, FeishuBindCallbackHandler(authService))
		auth.POST("/email/bind", requireAuth, EmailBindHandler(authService))
		auth.POST("/email/activate", requireAuth, EmailActivateBindingHandler(authService))
		auth.POST("/email/resend-binding", requireAuth, ResendEmailBindingHandler(authService))
		auth.POST("/logout", LogoutHandler())
		auth.GET("/github", OAuthLoginHandler("github", authService))
		auth.GET("/github/callback", OAuthCallbackHandler("github", authService))
		auth.GET("/gitlab", OAuthLoginHandler("gitlab", authService))
		auth.GET("/gitlab/callback", OAuthCallbackHandler("gitlab", authService))
	}

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Skills — public reads, protected writes
		v1.GET("/skills", ListSkillsHandler(skillService))
		v1.GET("/skills/:slug", optionalAuth, GetSkillHandler(skillService))
		v1.GET("/skills/:slug/versions", GetSkillVersionsHandler(skillService))
		v1.GET("/skills/:slug/versions/:version", GetSkillVersionHandler(skillService))
		v1.GET("/skills/:slug/file", GetSkillFileHandler(skillService))
		v1.GET("/skills/:slug/comments", ListSkillCommentsHandler(skillService))
		v1.POST("/skills/:slug/comments", requireAuth, CreateSkillCommentHandler(skillService))
		v1.DELETE("/skills/:slug", requireAuth, DeleteSkillHandler(skillService, authService))
		v1.POST("/skills/:slug/undelete", requireAuth, UndeleteSkillHandler(skillService, authService))
		v1.POST("/skills", requireAuth, PublishSkillHandler(skillService))

		// Stars
		v1.POST("/skills/:slug/star", requireAuth, StarSkillHandler(skillService))
		v1.DELETE("/skills/:slug/star", requireAuth, UnstarSkillHandler(skillService))
		v1.POST("/stars/:slug", requireAuth, StarSkillHandler(skillService))
		v1.DELETE("/stars/:slug", requireAuth, UnstarSkillHandler(skillService))

		// Search / Download / Resolve
		v1.GET("/search", SearchHandler(skillService))
		v1.GET("/download", DownloadHandler(skillService, zipService))
		v1.GET("/resolve", ResolveHandler(skillService))
		v1.POST("/import/gitlab/preview", requireAuth, GitLabImportPreviewHandler(gitlabImportService))
		v1.POST("/import/gitlab/candidate", requireAuth, GitLabImportCandidateHandler(gitlabImportService))
		v1.POST("/import/gitlab/files", requireAuth, GitLabImportFilesHandler(gitlabImportService))

		// Health check
		v1.GET("/health", HealthHandler())

		// Users
		v1.GET("/whoami", requireAuth, GetWhoamiHandler())
		v1.GET("/users/me", requireAuth, GetMeHandler(skillService, authService))
		v1.GET("/my/skills", requireAuth, GetMySkillsHandler(skillService))
		v1.GET("/my/skills/:slug", requireAuth, GetMySkillDetailHandler(skillService))
		v1.GET("/users/me/stars", requireAuth, GetMyStarsHandler(skillService))
		v1.GET("/users/me/tokens", requireAuth, ListTokensHandler(skillService))
		v1.POST("/users/me/tokens", requireAuth, CreateTokenHandler(skillService))
		v1.DELETE("/users/me/tokens/:id", requireAuth, RevokeTokenHandler(skillService))
		v1.GET("/users/:handle", GetUserHandler(skillService))
		v1.GET("/users/:handle/skills", GetUserSkillsHandler(skillService))

		admin := v1.Group("/admin")
		admin.Use(requireAuth)
		{
			admin.GET("/skills", ListAdminSkillsHandler(skillService, authService))
			admin.GET("/skills/:slug", GetAdminSkillDetailHandler(skillService, authService))
			admin.POST("/skills/:slug/delete", AdminDeleteSkillHandler(skillService, authService))
			admin.POST("/skills/:slug/undelete", AdminUndeleteSkillHandler(skillService, authService))
			admin.POST("/skills/:slug/highlighted", AdminSetSkillHighlightedHandler(skillService, authService))
			admin.GET("/users", ListAdminUsersHandler(authService))
			admin.GET("/users/:id", GetAdminUserHandler(skillService, authService))
			admin.POST("/users/:id/approve", ApproveAdminUserHandler(authService))
			admin.POST("/users/:id/reject", RejectAdminUserHandler(authService))
			admin.POST("/users/:id/disable", DisableAdminUserHandler(authService))
			admin.POST("/users/:id/enable", EnableAdminUserHandler(authService))
		}
	}
}
