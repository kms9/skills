package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/middleware"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/openclaw/clawhub/backend/internal/service"
	"gorm.io/gorm"
)

func GetMySkillsHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		statusFilter := strings.TrimSpace(c.Query("status"))
		items, err := listManagedSkills(skillService, managedSkillListOptions{
			OwnerUserID:    &user.ID,
			Status:         statusFilter,
			IncludeDeleted: statusFilter == "" || statusFilter == "deleted",
			IncludeOwner:   false,
			Query:          strings.TrimSpace(c.Query("q")),
			Limit:          queryLimit(c, 100, 200),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list skills"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"items": items})
	}
}

func GetMySkillDetailHandler(skillService *service.SkillService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		skill, versions, owner, err := loadManagedSkillDetail(skillService, c.Param("slug"))
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load skill"})
			return
		}
		if skill.OwnerUserID == nil || *skill.OwnerUserID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "permission denied"})
			return
		}

		c.JSON(http.StatusOK, managedSkillDetailResponse(skillService, skill, versions, owner))
	}
}

func ListAdminSkillsHandler(skillService *service.SkillService, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor := middleware.GetCurrentUser(c)
		if !authService.HasManagementAccess(actor) || !authService.IsSuperuser(actor) {
			c.JSON(http.StatusForbidden, gin.H{"error": "superuser required"})
			return
		}

		items, err := listManagedSkills(skillService, managedSkillListOptions{
			Status:         strings.TrimSpace(c.Query("status")),
			IncludeDeleted: true,
			IncludeOwner:   true,
			Query:          strings.TrimSpace(c.Query("q")),
			OwnerHandle:    strings.TrimSpace(c.Query("owner")),
			Limit:          queryLimit(c, 100, 200),
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list skills"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"items": items})
	}
}

func GetAdminSkillDetailHandler(skillService *service.SkillService, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor := middleware.GetCurrentUser(c)
		if !authService.HasManagementAccess(actor) || !authService.IsSuperuser(actor) {
			c.JSON(http.StatusForbidden, gin.H{"error": "superuser required"})
			return
		}

		skill, versions, owner, err := loadManagedSkillDetail(skillService, c.Param("slug"))
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load skill"})
			return
		}

		c.JSON(http.StatusOK, managedSkillDetailResponse(skillService, skill, versions, owner))
	}
}

func AdminDeleteSkillHandler(skillService *service.SkillService, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor := middleware.GetCurrentUser(c)
		if !authService.HasManagementAccess(actor) || !authService.IsSuperuser(actor) {
			c.JSON(http.StatusForbidden, gin.H{"error": "superuser required"})
			return
		}
		if err := skillService.DeleteSkill(c.Request.Context(), c.Param("slug")); err != nil {
			if err.Error() == "skill not found" {
				c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete skill"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": "deleted"})
	}
}

func AdminUndeleteSkillHandler(skillService *service.SkillService, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor := middleware.GetCurrentUser(c)
		if !authService.HasManagementAccess(actor) || !authService.IsSuperuser(actor) {
			c.JSON(http.StatusForbidden, gin.H{"error": "superuser required"})
			return
		}
		if err := skillService.UndeleteSkill(c.Request.Context(), c.Param("slug")); err != nil {
			if err.Error() == "skill not found or not deleted" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "skill not found or not deleted"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to undelete skill"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": "undeleted"})
	}
}

func AdminSetSkillHighlightedHandler(skillService *service.SkillService, authService *service.AuthService) gin.HandlerFunc {
	type requestBody struct {
		Highlighted bool `json:"highlighted"`
	}

	return func(c *gin.Context) {
		actor := middleware.GetCurrentUser(c)
		if !authService.HasManagementAccess(actor) || !authService.IsSuperuser(actor) {
			c.JSON(http.StatusForbidden, gin.H{"error": "superuser required"})
			return
		}

		var body requestBody
		if err := json.NewDecoder(c.Request.Body).Decode(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		if err := skillService.SetSkillHighlighted(c.Request.Context(), c.Param("slug"), body.Highlighted); err != nil {
			if err.Error() == "skill not found" {
				c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update highlighted status"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"ok":          "updated",
			"highlighted": body.Highlighted,
		})
	}
}

type managedSkillListOptions struct {
	OwnerUserID    *string
	OwnerHandle    string
	Status         string
	Query          string
	IncludeDeleted bool
	IncludeOwner   bool
	Limit          int
}

func listManagedSkills(skillService *service.SkillService, opts managedSkillListOptions) ([]gin.H, error) {
	db := skillService.DB().Model(&model.Skill{}).Preload("LatestVersion")
	if opts.OwnerUserID != nil {
		db = db.Where("owner_user_id = ?", *opts.OwnerUserID)
	}
	if opts.OwnerHandle != "" {
		var owner model.User
		if err := skillService.DB().Where("handle = ?", opts.OwnerHandle).First(&owner).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return []gin.H{}, nil
			}
			return nil, err
		}
		db = db.Where("owner_user_id = ?", owner.ID)
	}
	switch opts.Status {
	case "active":
		db = db.Where("is_deleted = ?", false)
	case "deleted":
		db = db.Where("is_deleted = ?", true)
	default:
		if !opts.IncludeDeleted {
			db = db.Where("is_deleted = ?", false)
		}
	}
	if opts.Query != "" {
		like := "%" + opts.Query + "%"
		db = db.Where("slug ILIKE ? OR display_name ILIKE ?", like, like)
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 100
	}
	var skills []model.Skill
	if err := db.Order("updated_at DESC").Limit(limit).Find(&skills).Error; err != nil {
		return nil, err
	}

	ownersByID, err := loadOwnersByID(skillService, skills)
	if err != nil {
		return nil, err
	}

	items := make([]gin.H, 0, len(skills))
	for i := range skills {
		item := managedSkillListItem(skillService, &skills[i], ownersByID[ownerID(skills[i].OwnerUserID)], opts.IncludeOwner)
		items = append(items, item)
	}
	return items, nil
}

func loadManagedSkillDetail(skillService *service.SkillService, slug string) (*model.Skill, []model.VersionInfo, *model.User, error) {
	var skill model.Skill
	if err := skillService.DB().Where("slug = ?", slug).Preload("LatestVersion").First(&skill).Error; err != nil {
		return nil, nil, nil, err
	}

	versions, err := skillService.GetSkillVersions(nil, slug)
	if err != nil {
		return nil, nil, nil, err
	}

	var owner *model.User
	if skill.OwnerUserID != nil {
		var user model.User
		if err := skillService.DB().Where("id = ?", *skill.OwnerUserID).First(&user).Error; err == nil {
			owner = &user
		}
	}

	return &skill, versions, owner, nil
}

func managedSkillDetailResponse(skillService *service.SkillService, skill *model.Skill, versions []model.VersionInfo, owner *model.User) gin.H {
	return gin.H{
		"skill":         managedSkillListItem(skillService, skill, owner, true),
		"versions":      versions,
		"owner":         ownerSummary(owner),
		"currentStatus": managedSkillStatus(skill),
	}
}

func managedSkillListItem(skillService *service.SkillService, skill *model.Skill, owner *model.User, includeOwner bool) gin.H {
	item := skillService.SkillToItem(skill)
	resp := gin.H{
		"id":            skill.ID,
		"slug":          item.Slug,
		"displayName":   item.DisplayName,
		"summary":       item.Summary,
		"tags":          item.Tags,
		"stats":         item.Stats,
		"highlighted":   item.Highlighted,
		"createdAt":     item.CreatedAt,
		"updatedAt":     item.UpdatedAt,
		"latestVersion": item.LatestVersion,
		"isDeleted":     skill.IsDeleted,
		"status":        managedSkillStatus(skill),
	}
	if includeOwner {
		resp["owner"] = ownerSummary(owner)
	}
	return resp
}

func managedSkillStatus(skill *model.Skill) string {
	if skill.IsDeleted {
		return "deleted"
	}
	return "active"
}

func ownerSummary(owner *model.User) gin.H {
	if owner == nil {
		return nil
	}
	return gin.H{
		"id":          owner.ID,
		"handle":      owner.Handle,
		"displayName": owner.DisplayName,
		"email":       owner.Email,
		"status":      owner.Status,
	}
}

func loadOwnersByID(skillService *service.SkillService, skills []model.Skill) (map[string]*model.User, error) {
	ownerIDs := make([]string, 0, len(skills))
	seen := make(map[string]struct{}, len(skills))
	for _, skill := range skills {
		id := ownerID(skill.OwnerUserID)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ownerIDs = append(ownerIDs, id)
	}
	if len(ownerIDs) == 0 {
		return map[string]*model.User{}, nil
	}

	var owners []model.User
	if err := skillService.DB().Where("id IN ?", ownerIDs).Find(&owners).Error; err != nil {
		return nil, err
	}
	ownersByID := make(map[string]*model.User, len(owners))
	for i := range owners {
		owner := owners[i]
		ownersByID[owner.ID] = &owner
	}
	return ownersByID, nil
}

func ownerID(id *string) string {
	if id == nil {
		return ""
	}
	return *id
}

func queryLimit(c *gin.Context, fallback, max int) int {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(fallback)))
	if err != nil || limit <= 0 {
		return fallback
	}
	if limit > max {
		return max
	}
	return limit
}
