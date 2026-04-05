package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/openclaw/clawhub/backend/internal/service"
)

func GitLabImportPreviewHandler(gitlabImportService *service.GitLabImportService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if gitlabImportService == nil || !gitlabImportService.Enabled() {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "gitlab import is not configured"})
			return
		}

		var req model.GitLabImportPreviewRequest
		if err := c.ShouldBindJSON(&req); err != nil || req.URL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
			return
		}

		resp, err := gitlabImportService.Preview(c.Request.Context(), req.URL)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func GitLabImportCandidateHandler(gitlabImportService *service.GitLabImportService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if gitlabImportService == nil || !gitlabImportService.Enabled() {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "gitlab import is not configured"})
			return
		}

		var req model.GitLabImportCandidateRequest
		if err := c.ShouldBindJSON(&req); err != nil || req.URL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
			return
		}

		resp, err := gitlabImportService.PreviewCandidate(c.Request.Context(), req.URL, req.CandidatePath)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func GitLabImportFilesHandler(gitlabImportService *service.GitLabImportService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if gitlabImportService == nil || !gitlabImportService.Enabled() {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "gitlab import is not configured"})
			return
		}

		var req model.GitLabImportFilesRequest
		if err := c.ShouldBindJSON(&req); err != nil || req.URL == "" || req.Commit == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "url and commit are required"})
			return
		}
		if len(req.SelectedPaths) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "selectedPaths is required"})
			return
		}

		resp, err := gitlabImportService.DownloadFiles(
			c.Request.Context(),
			req.URL,
			req.Commit,
			req.CandidatePath,
			req.SelectedPaths,
		)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}
