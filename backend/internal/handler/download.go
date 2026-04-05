package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/openclaw/clawhub/backend/internal/service"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

func DownloadHandler(skillService *service.SkillService, zipService *service.ZipService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Query("slug")
		if slug == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing slug parameter"})
			return
		}

		version := c.Query("version")

		// Get skill
		var skill model.Skill
		query := skillService.DB().Where("slug = ? AND is_deleted = ?", slug, false)
		if err := query.Preload("LatestVersion").First(&skill).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Get version
		var skillVersion model.SkillVersion
		if version != "" {
			if err := skillService.DB().Where("skill_id = ? AND version = ?", skill.ID, version).
				First(&skillVersion).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "version not found"})
				return
			}
		} else {
			if skill.LatestVersion == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "no versions available"})
				return
			}
			skillVersion = *skill.LatestVersion
		}

		// Set headers
		filename := fmt.Sprintf("%s-%s.zip", slug, skillVersion.Version)
		c.Header("Content-Type", "application/zip")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))

		// Generate ZIP
		if err := zipService.GenerateZip(c.Request.Context(), &skill, &skillVersion, c.Writer); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := skillService.IncrementDownloadAndInstallStats(c.Request.Context(), skill.ID); err != nil {
			logrus.WithError(err).
				WithField("skill_id", skill.ID).
				WithField("slug", skill.Slug).
				Warn("failed to update download/install stats")
		}
	}
}
