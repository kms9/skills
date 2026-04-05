package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/middleware"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/openclaw/clawhub/backend/internal/service"
	"gorm.io/gorm"
)

func ListSkillCommentsHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Param("slug")

		var skill model.Skill
		if err := skillService.DB().Where("slug = ? AND is_deleted = ?", slug, false).First(&skill).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load skill"})
			return
		}

		var comments []model.SkillComment
		if err := skillService.DB().
			Where("skill_id = ?", skill.ID).
			Order("created_at DESC").
			Find(&comments).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load comments"})
			return
		}

		userIDs := make([]string, 0, len(comments))
		seen := make(map[string]struct{}, len(comments))
		for _, comment := range comments {
			if _, ok := seen[comment.UserID]; ok {
				continue
			}
			seen[comment.UserID] = struct{}{}
			userIDs = append(userIDs, comment.UserID)
		}

		usersByID := make(map[string]model.User, len(userIDs))
		if len(userIDs) > 0 {
			var users []model.User
			if err := skillService.DB().Where("id IN ?", userIDs).Find(&users).Error; err == nil {
				for _, user := range users {
					usersByID[user.ID] = user
				}
			}
		}

		items := make([]gin.H, 0, len(comments))
		for _, comment := range comments {
			user, ok := usersByID[comment.UserID]
			if !ok {
				continue
			}
			items = append(items, gin.H{
				"id":        comment.ID,
				"body":      comment.Body,
				"createdAt": comment.CreatedAt.Unix(),
				"user": gin.H{
					"id":          user.ID,
					"handle":      user.Handle,
					"displayName": user.DisplayName,
					"image":       user.AvatarURL,
				},
			})
		}

		c.JSON(http.StatusOK, gin.H{"items": items})
	}
}

func CreateSkillCommentHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		slug := c.Param("slug")

		var skill model.Skill
		if err := skillService.DB().Where("slug = ? AND is_deleted = ?", slug, false).First(&skill).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load skill"})
			return
		}

		var req struct {
			Body string `json:"body" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "body is required"})
			return
		}

		body := strings.TrimSpace(req.Body)
		if body == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "body is required"})
			return
		}
		if len(body) > 5000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "comment too long"})
			return
		}

		comment := model.SkillComment{
			SkillID: skill.ID,
			UserID:  user.ID,
			Body:    body,
		}
		if err := skillService.DB().Create(&comment).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create comment"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"id":        comment.ID,
			"body":      comment.Body,
			"createdAt": comment.CreatedAt.Unix(),
			"user": gin.H{
				"id":          user.ID,
				"handle":      user.Handle,
				"displayName": user.DisplayName,
				"image":       user.AvatarURL,
			},
		})
	}
}
