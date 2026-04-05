package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/middleware"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/openclaw/clawhub/backend/internal/service"
	"gorm.io/gorm"
)

// GET /api/v1/users/me
func GetMeHandler(skillService *service.SkillService, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		identities, err := authService.ListUserIdentities(c.Request.Context(), user.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load identities"})
			return
		}
		var feishuBinding gin.H
		for _, identity := range identities {
			if identity.Provider != "feishu" {
				continue
			}
			feishuBinding = gin.H{
				"bound":       true,
				"openId":      identity.ProviderOpenID,
				"unionId":     identity.ProviderUnionID,
				"tenantKey":   identity.ProviderTenantKey,
				"displayName": emptyStringAsNull(identity.ProviderUsername),
				"email":       emptyStringAsNull(identity.ProviderEmail),
			}
			break
		}
		if feishuBinding == nil {
			feishuBinding = gin.H{"bound": false}
		}
		c.JSON(http.StatusOK, gin.H{
			"id":                  user.ID,
			"handle":              user.Handle,
			"displayName":         user.DisplayName,
			"email":               user.Email,
			"pendingEmail":        emptyStringAsNull(user.PendingEmail),
			"avatarUrl":           user.AvatarURL,
			"bio":                 user.Bio,
			"role":                user.Role,
			"status":              user.Status,
			"authProvider":        user.AuthProvider,
			"hasBoundEmail":       authService.HasBoundEmail(user),
			"emailVerifiedAt":     user.EmailVerifiedAt,
			"isSuperuser":         authService.IsSuperuser(user),
			"hasManagementAccess": authService.HasManagementAccess(user),
			"feishuBinding":       feishuBinding,
		})
	}
}

func GetWhoamiHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		c.JSON(http.StatusOK, gin.H{
			"user": gin.H{
				"handle":      emptyStringAsNull(user.Handle),
				"displayName": emptyStringAsNull(user.DisplayName),
				"image":       emptyStringAsNull(user.AvatarURL),
			},
		})
	}
}

// GET /api/v1/users/:handle
func GetUserHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		handle := c.Param("handle")
		var user model.User
		if err := skillService.DB().Where("handle = ?", handle).First(&user).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
			return
		}
		// Return public profile; email is exposed for public identity display.
		c.JSON(http.StatusOK, gin.H{
			"id":          user.ID,
			"handle":      user.Handle,
			"displayName": user.DisplayName,
			"email":       emptyStringAsNull(user.Email),
			"avatarUrl":   user.AvatarURL,
			"bio":         user.Bio,
			"createdAt":   user.CreatedAt.Unix(),
		})
	}
}

// GET /api/v1/users/:handle/skills
func GetUserSkillsHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		handle := c.Param("handle")
		var user model.User
		if err := skillService.DB().Where("handle = ?", handle).First(&user).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
			return
		}

		cursor := c.Query("cursor")
		var skills []model.Skill
		q := skillService.DB().
			Where("owner_user_id = ? AND is_deleted = ?", user.ID, false).
			Preload("LatestVersion").
			Order("updated_at DESC").
			Limit(21)
		if cursor != "" {
			q = q.Where("updated_at < (SELECT updated_at FROM skills WHERE id = ?)", cursor)
		}
		if err := q.Find(&skills).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list skills"})
			return
		}

		var nextCursor *string
		if len(skills) == 21 {
			skills = skills[:20]
			id := skills[19].ID
			nextCursor = &id
		}

		items := make([]model.SkillItem, len(skills))
		for i := range skills {
			items[i] = skillService.SkillToItem(&skills[i])
		}
		c.JSON(http.StatusOK, model.SkillListResponse{Items: items, NextCursor: nextCursor})
	}
}

// POST /api/v1/skills/:slug/star
func StarSkillHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		slug := c.Param("slug")

		var skill model.Skill
		if err := skillService.DB().Where("slug = ? AND is_deleted = ?", slug, false).First(&skill).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
			return
		}

		star := model.UserStar{UserID: user.ID, SkillID: skill.ID}
		result := skillService.DB().Where(star).FirstOrCreate(&star)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to star skill"})
			return
		}
		alreadyStarred := result.RowsAffected == 0
		if !alreadyStarred {
			skillService.DB().Model(&skill).UpdateColumn("stats_stars", gorm.Expr("stats_stars + 1"))
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":             "true",
			"starred":        true,
			"alreadyStarred": alreadyStarred,
		})
	}
}

// DELETE /api/v1/skills/:slug/star
func UnstarSkillHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		slug := c.Param("slug")

		var skill model.Skill
		if err := skillService.DB().Where("slug = ? AND is_deleted = ?", slug, false).First(&skill).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
			return
		}

		result := skillService.DB().
			Where("user_id = ? AND skill_id = ?", user.ID, skill.ID).
			Delete(&model.UserStar{})
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unstar skill"})
			return
		}
		alreadyUnstarred := result.RowsAffected == 0
		if !alreadyUnstarred {
			skillService.DB().Model(&skill).UpdateColumn("stats_stars", gorm.Expr("stats_stars - 1"))
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":               "true",
			"unstarred":        true,
			"alreadyUnstarred": alreadyUnstarred,
		})
	}
}

func emptyStringAsNull(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// GET /api/v1/users/me/stars
func GetMyStarsHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)

		var stars []model.UserStar
		if err := skillService.DB().Where("user_id = ?", user.ID).
			Order("created_at DESC").Find(&stars).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get stars"})
			return
		}

		skillIDs := make([]string, len(stars))
		for i, s := range stars {
			skillIDs[i] = s.SkillID
		}

		var skills []model.Skill
		if len(skillIDs) > 0 {
			skillService.DB().Where("id IN ? AND is_deleted = ?", skillIDs, false).
				Preload("LatestVersion").Find(&skills)
		}

		items := make([]model.SkillItem, len(skills))
		for i := range skills {
			items[i] = skillService.SkillToItem(&skills[i])
		}
		c.JSON(http.StatusOK, model.SkillListResponse{Items: items, NextCursor: nil})
	}
}

// POST /api/v1/users/me/tokens
func CreateTokenHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)

		var req struct {
			Label string `json:"label" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "label is required"})
			return
		}

		// Generate 32-byte random token
		raw := make([]byte, 32)
		if _, err := rand.Read(raw); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}
		tokenStr := hex.EncodeToString(raw)
		h := sha256.Sum256([]byte(tokenStr))
		tokenHash := hex.EncodeToString(h[:])

		apiToken := model.APIToken{
			UserID:    user.ID,
			Label:     req.Label,
			TokenHash: tokenHash,
		}
		if err := skillService.DB().Create(&apiToken).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create token"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token":     tokenStr,
			"id":        apiToken.ID,
			"label":     apiToken.Label,
			"createdAt": apiToken.CreatedAt,
		})
	}
}

// GET /api/v1/users/me/tokens
func ListTokensHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)

		var tokens []model.APIToken
		if err := skillService.DB().Where("user_id = ?", user.ID).
			Order("created_at DESC").Find(&tokens).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list tokens"})
			return
		}

		type tokenItem struct {
			ID         string     `json:"id"`
			Label      string     `json:"label"`
			CreatedAt  time.Time  `json:"createdAt"`
			LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
		}
		items := make([]tokenItem, len(tokens))
		for i, t := range tokens {
			items[i] = tokenItem{
				ID:         t.ID,
				Label:      t.Label,
				CreatedAt:  t.CreatedAt,
				LastUsedAt: t.LastUsedAt,
			}
		}
		c.JSON(http.StatusOK, gin.H{"tokens": items})
	}
}

// DELETE /api/v1/users/me/tokens/:id
func RevokeTokenHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		id := c.Param("id")

		result := skillService.DB().
			Where("id = ? AND user_id = ?", id, user.ID).
			Delete(&model.APIToken{})
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to revoke token"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "token not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": "revoked"})
	}
}

// GET /api/v1/admin/users
func ListAdminUsersHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor := middleware.GetCurrentUser(c)
		if !authService.HasManagementAccess(actor) || !authService.IsSuperuser(actor) {
			c.JSON(http.StatusForbidden, gin.H{"error": "superuser required"})
			return
		}

		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		users, err := authService.ListUsersForReview(
			c.Request.Context(),
			strings.TrimSpace(c.Query("status")),
			strings.TrimSpace(c.Query("q")),
			limit,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
			return
		}

		items := make([]gin.H, 0, len(users))
		for _, user := range users {
			items = append(items, adminUserResponse(&user, authService.IsSuperuser(&user)))
		}
		c.JSON(http.StatusOK, gin.H{"items": items})
	}
}

// GET /api/v1/admin/users/:id
func GetAdminUserHandler(skillService *service.SkillService, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor := middleware.GetCurrentUser(c)
		if !authService.HasManagementAccess(actor) || !authService.IsSuperuser(actor) {
			c.JSON(http.StatusForbidden, gin.H{"error": "superuser required"})
			return
		}

		user, err := authService.GetUserByID(c.Request.Context(), c.Param("id"))
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
			return
		}
		skillItems, skillsErr := listManagedSkills(skillService, managedSkillListOptions{
			OwnerUserID:    &user.ID,
			IncludeDeleted: true,
			IncludeOwner:   false,
		})
		if skillsErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user skills"})
			return
		}

		response := adminUserResponse(user, authService.IsSuperuser(user))
		response["skills"] = skillItems
		c.JSON(http.StatusOK, response)
	}
}

type adminUserActionRequest struct {
	Note string `json:"note"`
}

func ApproveAdminUserHandler(authService *service.AuthService) gin.HandlerFunc {
	return updateAdminUserStatusHandler(authService, model.UserStatusActive, model.UserStatusReviewPending, model.UserStatusRejected)
}

func RejectAdminUserHandler(authService *service.AuthService) gin.HandlerFunc {
	return updateAdminUserStatusHandler(authService, model.UserStatusRejected, model.UserStatusReviewPending)
}

func DisableAdminUserHandler(authService *service.AuthService) gin.HandlerFunc {
	return updateAdminUserStatusHandler(authService, model.UserStatusDisabled, model.UserStatusActive)
}

func EnableAdminUserHandler(authService *service.AuthService) gin.HandlerFunc {
	return updateAdminUserStatusHandler(authService, model.UserStatusActive, model.UserStatusDisabled)
}

func updateAdminUserStatusHandler(authService *service.AuthService, status string, allowedCurrent ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor := middleware.GetCurrentUser(c)
		if !authService.HasManagementAccess(actor) || !authService.IsSuperuser(actor) {
			c.JSON(http.StatusForbidden, gin.H{"error": "superuser required"})
			return
		}

		var req adminUserActionRequest
		if c.Request.ContentLength > 0 {
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
				return
			}
		}

		currentUser, err := authService.GetUserByID(c.Request.Context(), c.Param("id"))
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get user"})
			return
		}
		if len(allowedCurrent) > 0 && !containsStatus(allowedCurrent, currentUser.Status) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status transition"})
			return
		}

		user, err := authService.UpdateUserReviewStatus(c.Request.Context(), actor, c.Param("id"), status, req.Note)
		if err != nil {
			switch err {
			case gorm.ErrRecordNotFound:
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			default:
				if strings.Contains(err.Error(), "invalid status transition") {
					c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status transition"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
			}
			return
		}

		c.JSON(http.StatusOK, adminUserResponse(user, authService.IsSuperuser(user)))
	}
}

func containsStatus(statuses []string, value string) bool {
	for _, status := range statuses {
		if status == value {
			return true
		}
	}
	return false
}

func adminUserResponse(user *model.User, isSuperuser bool) gin.H {
	return gin.H{
		"id":              user.ID,
		"handle":          user.Handle,
		"displayName":     user.DisplayName,
		"email":           user.Email,
		"pendingEmail":    emptyStringAsNull(user.PendingEmail),
		"avatarUrl":       user.AvatarURL,
		"bio":             user.Bio,
		"role":            user.Role,
		"status":          user.Status,
		"authProvider":    user.AuthProvider,
		"hasBoundEmail":   user.HasBoundEmail,
		"emailVerifiedAt": user.EmailVerifiedAt,
		"createdAt":       user.CreatedAt,
		"reviewedBy":      user.ReviewedBy,
		"reviewedAt":      user.ReviewedAt,
		"reviewNote":      user.ReviewNote,
		"isSuperuser":     isSuperuser,
	}
}
