package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/openclaw/clawhub/backend/internal/model"
	"gorm.io/gorm"
)

type SkillService struct {
	db             *gorm.DB
	storageService StorageService
}

func NewSkillService(db *gorm.DB, storageService StorageService) *SkillService {
	return &SkillService{
		db:             db,
		storageService: storageService,
	}
}

func (s *SkillService) DB() *gorm.DB {
	return s.db
}

func (s *SkillService) StorageService() StorageService {
	return s.storageService
}

func (s *SkillService) ListSkills(
	ctx context.Context,
	limit int,
	cursor *string,
	sortKey string,
	dir string,
	highlightedOnly bool,
) (*model.SkillListResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}

	orderColumn, orderDir := normalizeSkillListOrdering(sortKey, dir)
	var skills []model.Skill
	query := s.db.WithContext(ctx).
		Where("is_deleted = ? AND moderation_status = ?", false, "active").
		Order(fmt.Sprintf("%s %s", orderColumn, orderDir)).
		Order(fmt.Sprintf("id %s", orderDir)).
		Limit(limit)

	if highlightedOnly {
		query = query.Where("is_highlighted = ?", true)
	}

	if cursor != nil && *cursor != "" {
		query = query.Where("id < ?", *cursor)
	}

	if err := query.Preload("LatestVersion").Find(&skills).Error; err != nil {
		return nil, fmt.Errorf("failed to list skills: %w", err)
	}

	items := make([]model.SkillItem, len(skills))
	for i, skill := range skills {
		items[i] = s.skillToItem(&skill)
	}

	var nextCursor *string
	if len(skills) == limit {
		lastID := skills[len(skills)-1].ID
		nextCursor = &lastID
	}

	return &model.SkillListResponse{
		Items:      items,
		NextCursor: nextCursor,
	}, nil
}

func normalizeSkillListOrdering(sortKey string, dir string) (column string, direction string) {
	switch strings.TrimSpace(sortKey) {
	case "name":
		column = "display_name"
	case "updated", "newest", "":
		column = "updated_at"
	case "downloads":
		column = "stats_downloads"
	case "stars", "rating":
		column = "stats_stars"
	case "installs", "installsCurrent", "installsAllTime", "trending":
		column = "stats_installs"
	default:
		column = "updated_at"
	}

	switch strings.ToLower(strings.TrimSpace(dir)) {
	case "asc":
		direction = "ASC"
	case "desc", "":
		direction = "DESC"
	default:
		if column == "display_name" {
			direction = "ASC"
		} else {
			direction = "DESC"
		}
	}

	if dir == "" && column == "display_name" {
		direction = "ASC"
	}

	return column, direction
}

func (s *SkillService) GetSkill(ctx context.Context, slug string, currentUserID string) (*model.SkillDetailResponse, error) {
	var skill model.Skill
	if err := s.db.Where("slug = ? AND is_deleted = ?", slug, false).
		Preload("LatestVersion").
		First(&skill).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("skill not found")
		}
		return nil, fmt.Errorf("failed to get skill: %w", err)
	}

	resp := &model.SkillDetailResponse{
		Skill:     s.skillToItem(&skill),
		IsStarred: false,
	}
	if skill.LatestVersion != nil {
		resp.LatestVersion = s.versionToInfo(skill.LatestVersion, true)
	}

	// Populate owner info
	if skill.OwnerUserID != nil {
		var owner model.User
		if err := s.db.First(&owner, "id = ?", *skill.OwnerUserID).Error; err == nil {
			resp.Owner = &model.OwnerInfo{
				Handle:      &owner.Handle,
				DisplayName: &owner.DisplayName,
				Image:       &owner.AvatarURL,
			}
		}
	}

	// Check if current user has starred this skill
	if currentUserID != "" {
		var count int64
		s.db.Model(&model.UserStar{}).
			Where("user_id = ? AND skill_id = ?", currentUserID, skill.ID).
			Count(&count)
		resp.IsStarred = count > 0
	}

	return resp, nil
}

func (s *SkillService) GetSkillVersions(ctx context.Context, slug string) ([]model.VersionInfo, error) {
	var skill model.Skill
	if err := s.db.Where("slug = ?", slug).First(&skill).Error; err != nil {
		return nil, fmt.Errorf("skill not found")
	}

	var versions []model.SkillVersion
	if err := s.db.Where("skill_id = ?", skill.ID).
		Order("created_at DESC").
		Find(&versions).Error; err != nil {
		return nil, fmt.Errorf("failed to get versions: %w", err)
	}

	result := make([]model.VersionInfo, len(versions))
	for i, v := range versions {
		result[i] = *s.versionToInfo(&v, false)
	}

	return result, nil
}

func (s *SkillService) GetSkillVersion(ctx context.Context, slug, version string) (*model.SkillVersionResponse, error) {
	var skill model.Skill
	if err := s.db.WithContext(ctx).Where("slug = ? AND is_deleted = ?", slug, false).First(&skill).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("skill not found")
		}
		return nil, fmt.Errorf("failed to get skill: %w", err)
	}

	var skillVersion model.SkillVersion
	if err := s.db.WithContext(ctx).Where("skill_id = ? AND version = ?", skill.ID, version).First(&skillVersion).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("version not found")
		}
		return nil, fmt.Errorf("failed to get version: %w", err)
	}

	return &model.SkillVersionResponse{
		Version: s.versionToInfo(&skillVersion, true),
		Skill: &model.SkillVersionMeta{
			Slug:        skill.Slug,
			DisplayName: skill.DisplayName,
		},
	}, nil
}

func (s *SkillService) GetSkillFile(ctx context.Context, slug, path, version string) (*model.SkillVersion, *model.FileMetadata, []byte, error) {
	if path == "" {
		return nil, nil, nil, fmt.Errorf("path is required")
	}

	var skill model.Skill
	query := s.db.WithContext(ctx).Where("slug = ? AND is_deleted = ?", slug, false)
	if version == "" {
		query = query.Preload("LatestVersion")
	}
	if err := query.First(&skill).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil, nil, fmt.Errorf("skill not found")
		}
		return nil, nil, nil, fmt.Errorf("failed to get skill: %w", err)
	}

	var targetVersion model.SkillVersion
	if version != "" {
		if err := s.db.WithContext(ctx).Where("skill_id = ? AND version = ?", skill.ID, version).First(&targetVersion).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return nil, nil, nil, fmt.Errorf("version not found")
			}
			return nil, nil, nil, fmt.Errorf("failed to get version: %w", err)
		}
	} else {
		if skill.LatestVersion == nil {
			return nil, nil, nil, fmt.Errorf("version not found")
		}
		targetVersion = *skill.LatestVersion
	}

	for i := range targetVersion.Files {
		file := targetVersion.Files[i]
		if file.Path != path {
			continue
		}
		reader, err := s.storageService.Download(ctx, file.StorageKey)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("failed to download file: %w", err)
		}
		defer reader.Close()

		bytes, err := io.ReadAll(reader)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("failed to read file: %w", err)
		}
		return &targetVersion, &file, bytes, nil
	}

	return nil, nil, nil, fmt.Errorf("file not found")
}

func (s *SkillService) DeleteSkill(ctx context.Context, slug string) error {
	result := s.db.Model(&model.Skill{}).
		Where("slug = ? AND is_deleted = ?", slug, false).
		Update("is_deleted", true)

	if result.Error != nil {
		return fmt.Errorf("failed to delete skill: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("skill not found")
	}

	return nil
}

func (s *SkillService) UndeleteSkill(ctx context.Context, slug string) error {
	result := s.db.Model(&model.Skill{}).
		Where("slug = ? AND is_deleted = ?", slug, true).
		Update("is_deleted", false)

	if result.Error != nil {
		return fmt.Errorf("failed to undelete skill: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("skill not found or not deleted")
	}

	return nil
}

func (s *SkillService) SetSkillHighlighted(ctx context.Context, slug string, highlighted bool) error {
	result := s.db.WithContext(ctx).
		Model(&model.Skill{}).
		Where("slug = ?", slug).
		Update("is_highlighted", highlighted)

	if result.Error != nil {
		return fmt.Errorf("failed to update highlighted status: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("skill not found")
	}

	return nil
}

func (s *SkillService) Search(ctx context.Context, query string, limit int) (*model.SearchResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}

	results := make([]model.SearchResult, 0)
	err := s.db.Raw(`
		SELECT slug, display_name, description as summary, NULL as version,
		       (
		         GREATEST(
		           similarity(slug, ?),
		           similarity(display_name, ?),
		           similarity(description, ?)
		         )
		         + CASE WHEN slug ILIKE '%' || ? || '%' THEN 1.0 ELSE 0 END
		         + CASE WHEN display_name ILIKE '%' || ? || '%' THEN 1.0 ELSE 0 END
		         + CASE WHEN description ILIKE '%' || ? || '%' THEN 0.7 ELSE 0 END
		         + CASE WHEN ? = ANY(tags) THEN 0.8 ELSE 0 END
		       ) AS score,
		       EXTRACT(EPOCH FROM updated_at)::bigint as updated_at
		FROM skills
		WHERE is_deleted = FALSE
		  AND moderation_status = 'active'
		  AND (
		       slug ILIKE '%' || ? || '%'
		       OR display_name ILIKE '%' || ? || '%'
		       OR description ILIKE '%' || ? || '%'
		       OR ? = ANY(tags)
		       OR similarity(slug, ?) > 0.1
		       OR similarity(display_name, ?) > 0.1
		       OR similarity(description, ?) > 0.1
		  )
		ORDER BY score DESC, updated_at DESC
		LIMIT ?
	`, query, query, query, query, query, query, query, query, query, query, query, query, query, query, limit).Scan(&results).Error

	if err != nil {
		return nil, fmt.Errorf("search failed: %w", err)
	}

	return &model.SearchResponse{Results: results}, nil
}

func (s *SkillService) ResolveVersion(ctx context.Context, slug string, hash *string) (*model.ResolveResponse, error) {
	var skill model.Skill
	if err := s.db.Where("slug = ? AND is_deleted = ?", slug, false).
		Preload("LatestVersion").
		First(&skill).Error; err != nil {
		return nil, fmt.Errorf("skill not found")
	}

	response := &model.ResolveResponse{}

	if hash != nil && *hash != "" {
		var version model.SkillVersion
		if err := s.db.Where("skill_id = ? AND content_hash = ?", skill.ID, *hash).
			First(&version).Error; err == nil {
			response.Match = &model.VersionMatch{Version: version.Version}
		}
	}

	if skill.LatestVersion != nil {
		response.LatestVersion = &model.VersionMatch{Version: skill.LatestVersion.Version}
	}

	return response, nil
}

func (s *SkillService) CalculateVersionHash(files []model.FileMetadata) string {
	hashes := make([]string, len(files))
	for i, f := range files {
		hashes[i] = f.SHA256
	}
	sort.Strings(hashes)

	combined := ""
	for _, h := range hashes {
		combined += h
	}

	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:])
}

func (s *SkillService) IncrementDownloadAndInstallStats(ctx context.Context, skillID string) error {
	result := s.db.WithContext(ctx).
		Model(&model.Skill{}).
		Where("id = ?", skillID).
		Updates(map[string]interface{}{
			"stats_downloads": gorm.Expr("stats_downloads + 1"),
			"stats_installs":  gorm.Expr("stats_installs + 1"),
		})

	if result.Error != nil {
		return fmt.Errorf("failed to update skill stats: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("skill not found")
	}

	return nil
}

func (s *SkillService) SkillToItem(skill *model.Skill) model.SkillItem {
	return s.skillToItem(skill)
}

func (s *SkillService) skillToItem(skill *model.Skill) model.SkillItem {
	item := model.SkillItem{
		Slug:        skill.Slug,
		DisplayName: skill.DisplayName,
		Tags:        skill.Tags,
		Stats: model.SkillStats{
			Downloads: skill.StatsDownloads,
			Installs:  skill.StatsInstalls,
			Versions:  skill.StatsVersions,
			Stars:     skill.StatsStars,
		},
		Highlighted: skill.IsHighlighted,
		CreatedAt:   skill.CreatedAt.Unix(),
		UpdatedAt:   skill.UpdatedAt.Unix(),
	}

	if skill.Description != "" {
		item.Summary = &skill.Description
	}

	if skill.LatestVersion != nil {
		item.LatestVersion = s.versionToInfo(skill.LatestVersion, false)
	}

	return item
}

func (s *SkillService) versionToInfo(version *model.SkillVersion, includeFiles bool) *model.VersionInfo {
	if version == nil {
		return nil
	}

	info := &model.VersionInfo{
		Version:   version.Version,
		CreatedAt: version.CreatedAt.Unix(),
		Changelog: version.Changelog,
	}
	if includeFiles {
		info.Files = version.Files
		info.Parsed = version.Parsed
	}
	return info
}
