package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	cfg "github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/service"
)

func WellKnownHandler(config *cfg.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Determine base URL
		scheme := "http"
		if c.Request.TLS != nil {
			scheme = "https"
		}
		host := c.Request.Host
		apiBase := fmt.Sprintf("%s://%s/api/v1", scheme, host)

		c.Header("Cache-Control", "public, max-age=3600")
		c.JSON(http.StatusOK, gin.H{
			"apiBase":       apiBase,
			"minCliVersion": "1.0.0",
		})
	}
}

func ResolveHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Query("slug")
		if slug == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing slug parameter"})
			return
		}

		hash := c.Query("hash")
		var hashPtr *string
		if hash != "" {
			hashPtr = &hash
		}

		result, err := skillService.ResolveVersion(c.Request.Context(), slug, hashPtr)
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

func HealthHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
}
