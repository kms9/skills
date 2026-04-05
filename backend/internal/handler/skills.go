package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/middleware"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/openclaw/clawhub/backend/internal/service"
	"gorm.io/gorm"
)

func ListSkillsHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 25
		if l := c.Query("limit"); l != "" {
			if _, err := fmt.Sscanf(l, "%d", &limit); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid limit"})
				return
			}
		}

		cursor := c.Query("cursor")
		var cursorPtr *string
		if cursor != "" {
			cursorPtr = &cursor
		}

		sort := c.Query("sort")
		dir := c.Query("dir")
		highlightedOnly := isTruthyQueryValue(c.Query("highlighted"))

		result, err := skillService.ListSkills(c.Request.Context(), limit, cursorPtr, sort, dir, highlightedOnly)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

func isTruthyQueryValue(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func GetSkillHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Param("slug")

		currentUserID := ""
		if user := middleware.GetCurrentUser(c); user != nil {
			currentUserID = user.ID
		}

		result, err := skillService.GetSkill(c.Request.Context(), slug, currentUserID)
		if err != nil {
			if err.Error() == "skill not found" {
				c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

func GetSkillVersionsHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Param("slug")

		versions, err := skillService.GetSkillVersions(c.Request.Context(), slug)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if versions == nil {
			versions = make([]model.VersionInfo, 0)
		}
		c.JSON(http.StatusOK, model.VersionListResponse{
			Items:      versions,
			NextCursor: nil,
		})
	}
}

func GetSkillVersionHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Param("slug")
		version := c.Param("version")

		result, err := skillService.GetSkillVersion(c.Request.Context(), slug, version)
		if err != nil {
			switch err.Error() {
			case "skill not found", "version not found":
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			}
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

func GetSkillFileHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Param("slug")
		path := strings.TrimSpace(c.Query("path"))
		version := strings.TrimSpace(c.Query("version"))
		tag := strings.TrimSpace(c.Query("tag"))

		if path == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing path parameter"})
			return
		}
		if version != "" && tag != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "use either version or tag"})
			return
		}
		if version == "" && tag != "" {
			if tag != "latest" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "unknown tag"})
				return
			}
		}

		_, file, bytes, err := skillService.GetSkillFile(c.Request.Context(), slug, path, version)
		if err != nil {
			switch err.Error() {
			case "skill not found", "version not found", "file not found":
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			case "path is required":
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			}
			return
		}

		c.Header("Content-Type", normalizeResponseContentType(path, file.ContentType))
		c.String(http.StatusOK, string(bytes))
	}
}

func DeleteSkillHandler(skillService *service.SkillService, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Param("slug")
		currentUser := middleware.GetCurrentUser(c)

		var skill model.Skill
		if err := skillService.DB().Where("slug = ? AND is_deleted = ?", slug, false).First(&skill).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
			return
		}
		if !canManageSkill(currentUser, &skill, authService) {
			c.JSON(http.StatusForbidden, gin.H{"error": "permission denied"})
			return
		}

		if err := skillService.DeleteSkill(c.Request.Context(), slug); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": "true"})
	}
}

func UndeleteSkillHandler(skillService *service.SkillService, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Param("slug")
		currentUser := middleware.GetCurrentUser(c)

		var skill model.Skill
		if err := skillService.DB().Where("slug = ? AND is_deleted = ?", slug, true).First(&skill).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusBadRequest, gin.H{"error": "skill not found or not deleted"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load skill"})
			return
		}
		if !canManageSkill(currentUser, &skill, authService) {
			c.JSON(http.StatusForbidden, gin.H{"error": "permission denied"})
			return
		}

		if err := skillService.UndeleteSkill(c.Request.Context(), slug); err != nil {
			if err.Error() == "skill not found or not deleted" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "skill not found or not deleted"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": "true"})
	}
}

func canManageSkill(user *model.User, skill *model.Skill, authService *service.AuthService) bool {
	if user == nil {
		return false
	}
	if authService != nil && authService.IsSuperuser(user) {
		return true
	}
	if user.Role == "moderator" || user.Role == "admin" {
		return true
	}
	if skill.OwnerUserID != nil && *skill.OwnerUserID == user.ID {
		return true
	}
	return false
}
