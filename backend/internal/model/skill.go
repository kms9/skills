package model

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/lib/pq"
)

type Skill struct {
	ID               string         `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Slug             string         `gorm:"uniqueIndex;not null" json:"slug"`
	DisplayName      string         `gorm:"not null" json:"displayName"`
	Description      string         `gorm:"default:''" json:"description"`
	Tags             pq.StringArray `gorm:"type:text[]" json:"tags"`
	ModerationStatus string         `gorm:"default:'active'" json:"moderationStatus"`
	LatestVersionID  *string        `gorm:"type:uuid" json:"latestVersionId,omitempty"`
	StatsDownloads   int64          `gorm:"default:0" json:"-"`
	StatsInstalls    int64          `gorm:"default:0" json:"-"`
	StatsVersions    int            `gorm:"default:0" json:"-"`
	StatsStars       int            `gorm:"default:0" json:"-"`
	OwnerUserID      *string        `gorm:"type:uuid" json:"-"`
	IsHighlighted    bool           `gorm:"default:false" json:"-"`
	IsDeleted        bool           `gorm:"default:false" json:"-"`
	CreatedAt        time.Time      `json:"createdAt"`
	UpdatedAt        time.Time      `json:"updatedAt"`
	LatestVersion    *SkillVersion  `gorm:"foreignKey:ID;references:LatestVersionID" json:"latestVersion,omitempty"`
}

type SkillVersion struct {
	ID          string          `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	SkillID     string          `gorm:"type:uuid;not null" json:"skillId"`
	Version     string          `gorm:"not null" json:"version"`
	Changelog   string          `gorm:"default:''" json:"changelog"`
	Files       FileList        `gorm:"type:jsonb;not null" json:"files"`
	Parsed      json.RawMessage `gorm:"type:jsonb" json:"parsed,omitempty"`
	ContentHash string          `gorm:"column:content_hash" json:"contentHash,omitempty"`
	CreatedAt   time.Time       `json:"createdAt"`
}

type FileMetadata struct {
	Path        string `json:"path"`
	Size        int64  `json:"size"`
	StorageKey  string `json:"storageKey"`
	SHA256      string `json:"sha256"`
	ContentType string `json:"contentType,omitempty"`
}

type FileList []FileMetadata

func (f FileList) Value() (driver.Value, error) {
	return json.Marshal(f)
}

func (f *FileList) Scan(value interface{}) error {
	if value == nil {
		*f = FileList{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, f)
}

// DTOs for API responses
type SkillListResponse struct {
	Items      []SkillItem `json:"items"`
	NextCursor *string     `json:"nextCursor"`
}

type VersionListResponse struct {
	Items      []VersionInfo `json:"items"`
	NextCursor *string       `json:"nextCursor"`
}

type SkillItem struct {
	Slug          string       `json:"slug"`
	DisplayName   string       `json:"displayName"`
	Summary       *string      `json:"summary"`
	Tags          interface{}  `json:"tags"`
	Stats         SkillStats   `json:"stats"`
	Highlighted   bool         `json:"highlighted"`
	CreatedAt     int64        `json:"createdAt"`
	UpdatedAt     int64        `json:"updatedAt"`
	LatestVersion *VersionInfo `json:"latestVersion,omitempty"`
}

type SkillStats struct {
	Downloads int64 `json:"downloads"`
	Installs  int64 `json:"installs"`
	Versions  int   `json:"versions"`
	Stars     int   `json:"stars"`
}

type VersionInfo struct {
	Version   string          `json:"version"`
	CreatedAt int64           `json:"createdAt"`
	Changelog string          `json:"changelog"`
	Files     FileList        `json:"files,omitempty"`
	Parsed    json.RawMessage `json:"parsed,omitempty"`
}

type SkillDetailResponse struct {
	Skill         SkillItem    `json:"skill"`
	LatestVersion *VersionInfo `json:"latestVersion"`
	Owner         *OwnerInfo   `json:"owner"`
	IsStarred     bool         `json:"isStarred"`
}

type SkillVersionResponse struct {
	Version *VersionInfo      `json:"version,omitempty"`
	Skill   *SkillVersionMeta `json:"skill,omitempty"`
}

type SkillVersionMeta struct {
	Slug        string `json:"slug"`
	DisplayName string `json:"displayName"`
}

type OwnerInfo struct {
	Handle      *string `json:"handle"`
	DisplayName *string `json:"displayName"`
	Image       *string `json:"image"`
}

type SearchResult struct {
	Slug        string  `json:"slug"`
	DisplayName string  `json:"displayName"`
	Summary     *string `json:"summary"`
	Version     *string `json:"version"`
	Score       float64 `json:"score"`
	UpdatedAt   *int64  `json:"updatedAt,omitempty"`
}

type SearchResponse struct {
	Results []SearchResult `json:"results"`
}

type PublishPayload struct {
	Slug        string                 `json:"slug"`
	DisplayName string                 `json:"displayName"`
	Version     string                 `json:"version"`
	Changelog   string                 `json:"changelog"`
	Tags        []string               `json:"tags,omitempty"`
	Source      map[string]interface{} `json:"source,omitempty"`
	ForkOf      *ForkInfo              `json:"forkOf,omitempty"`
}

type ForkInfo struct {
	Slug    string  `json:"slug"`
	Version *string `json:"version,omitempty"`
}

type PublishResponse struct {
	OK        string `json:"ok"`
	SkillID   string `json:"skillId"`
	VersionID string `json:"versionId"`
}

type ResolveResponse struct {
	Match         *VersionMatch `json:"match"`
	LatestVersion *VersionMatch `json:"latestVersion"`
}

type VersionMatch struct {
	Version string `json:"version"`
}

type GitLabImportPreviewRequest struct {
	URL string `json:"url"`
}

type GitLabImportCandidateRequest struct {
	URL           string `json:"url"`
	CandidatePath string `json:"candidatePath"`
}

type GitLabImportFilesRequest struct {
	URL           string   `json:"url"`
	Commit        string   `json:"commit"`
	CandidatePath string   `json:"candidatePath"`
	SelectedPaths []string `json:"selectedPaths"`
}

type GitLabImportResolved struct {
	Kind    string `json:"kind"`
	Host    string `json:"host"`
	Repo    string `json:"repo"`
	Ref     string `json:"ref"`
	Commit  string `json:"commit"`
	Path    string `json:"path"`
	RepoURL string `json:"repoUrl"`
}

type GitLabImportCandidate struct {
	Path        string  `json:"path"`
	ReadmePath  string  `json:"readmePath"`
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type GitLabImportPreviewResponse struct {
	Resolved   GitLabImportResolved    `json:"resolved"`
	Candidates []GitLabImportCandidate `json:"candidates"`
}

type GitLabImportFileEntry struct {
	Path            string `json:"path"`
	Size            int64  `json:"size"`
	DefaultSelected bool   `json:"defaultSelected"`
}

type GitLabImportDefaults struct {
	SelectedPaths []string `json:"selectedPaths"`
	Slug          string   `json:"slug"`
	DisplayName   string   `json:"displayName"`
	Version       string   `json:"version"`
	Tags          []string `json:"tags"`
}

type GitLabImportCandidateResponse struct {
	Resolved  GitLabImportResolved    `json:"resolved"`
	Candidate GitLabImportCandidate   `json:"candidate"`
	Defaults  GitLabImportDefaults    `json:"defaults"`
	Files     []GitLabImportFileEntry `json:"files"`
}

type GitLabImportDownloadedFile struct {
	Path          string `json:"path"`
	ContentBase64 string `json:"contentBase64"`
	ContentType   string `json:"contentType"`
}

type GitLabImportFilesResponse struct {
	Files []GitLabImportDownloadedFile `json:"files"`
}
