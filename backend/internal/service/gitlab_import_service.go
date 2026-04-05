package service

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/openclaw/clawhub/backend/internal/config"
	"github.com/openclaw/clawhub/backend/internal/model"
)

type GitLabImportService struct {
	config  config.GitLabProviderConfig
	client  *http.Client
	baseURL *url.URL
}

type parsedGitLabImportURL struct {
	host string
	repo string
	ref  string
	path string
}

type gitLabProjectInfo struct {
	ID            int64  `json:"id"`
	DefaultBranch string `json:"default_branch"`
	WebURL        string `json:"web_url"`
}

type gitLabCommitInfo struct {
	ID string `json:"id"`
}

type gitLabTreeEntry struct {
	Type string `json:"type"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

type gitLabErrorResponse struct {
	Message any `json:"message"`
	Error   any `json:"error"`
}

type gitLabRepositoryFile struct {
	Path string
	Size int64
}

func NewGitLabImportService(cfg config.GitLabProviderConfig) (*GitLabImportService, error) {
	client := http.DefaultClient
	if cfg.CACertFile != "" {
		pemBytes, err := os.ReadFile(cfg.CACertFile)
		if err != nil {
			return nil, fmt.Errorf("read gitlab ca cert: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pemBytes) {
			return nil, fmt.Errorf("invalid gitlab ca cert bundle")
		}
		client = &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{RootCAs: pool},
			},
			Timeout: 20 * time.Second,
		}
	}

	var base *url.URL
	if strings.TrimSpace(cfg.BaseURL) != "" {
		parsed, err := url.Parse(strings.TrimSpace(cfg.BaseURL))
		if err != nil {
			return nil, fmt.Errorf("invalid gitlab base url: %w", err)
		}
		base = parsed
	}

	return &GitLabImportService{
		config:  cfg,
		client:  client,
		baseURL: base,
	}, nil
}

func (s *GitLabImportService) Enabled() bool {
	return s.baseURL != nil && s.baseURL.Host != "" && strings.TrimSpace(s.config.ImportToken) != ""
}

func (s *GitLabImportService) Preview(ctx context.Context, rawURL string) (*model.GitLabImportPreviewResponse, error) {
	resolved, files, candidates, err := s.resolveRepositorySnapshot(ctx, rawURL)
	if err != nil {
		return nil, err
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("no SKILL.md found in this repository or path")
	}
	_ = files
	return &model.GitLabImportPreviewResponse{
		Resolved:   *resolved,
		Candidates: candidates,
	}, nil
}

func (s *GitLabImportService) PreviewCandidate(ctx context.Context, rawURL, candidatePath string) (*model.GitLabImportCandidateResponse, error) {
	resolved, files, candidates, err := s.resolveRepositorySnapshot(ctx, rawURL)
	if err != nil {
		return nil, err
	}
	normalizedCandidatePath := normalizeRepoPath(candidatePath)
	var candidate *model.GitLabImportCandidate
	for i := range candidates {
		if candidates[i].Path == normalizedCandidatePath {
			candidate = &candidates[i]
			break
		}
	}
	if candidate == nil {
		return nil, fmt.Errorf("candidate not found")
	}

	prefix := normalizedCandidatePath
	if prefix != "" {
		prefix += "/"
	}
	outFiles := make([]model.GitLabImportFileEntry, 0)
	selectedPaths := make([]string, 0)
	for _, file := range files {
		if prefix != "" && !strings.HasPrefix(file.Path, prefix) {
			continue
		}
		relativePath := strings.TrimPrefix(file.Path, prefix)
		if relativePath == "" {
			continue
		}
		outFiles = append(outFiles, model.GitLabImportFileEntry{
			Path:            relativePath,
			Size:            file.Size,
			DefaultSelected: true,
		})
		selectedPaths = append(selectedPaths, relativePath)
	}

	candidateName := basename(normalizedCandidatePath)
	if candidateName == "" {
		candidateName = basename(resolved.Repo)
	}
	displayName := deriveDisplayName(candidateName)
	slug := deriveSlug(candidateName)

	return &model.GitLabImportCandidateResponse{
		Resolved:  *resolved,
		Candidate: *candidate,
		Defaults: model.GitLabImportDefaults{
			SelectedPaths: selectedPaths,
			Slug:          slug,
			DisplayName:   displayName,
			Version:       "0.1.0",
			Tags:          []string{"latest"},
		},
		Files: outFiles,
	}, nil
}

func (s *GitLabImportService) DownloadFiles(
	ctx context.Context,
	rawURL string,
	expectedCommit string,
	candidatePath string,
	selectedPaths []string,
) (*model.GitLabImportFilesResponse, error) {
	parsed, err := s.parseURL(rawURL)
	if err != nil {
		return nil, err
	}
	project, err := s.fetchProject(ctx, parsed.repo)
	if err != nil {
		return nil, err
	}
	ref := parsed.ref
	if ref == "" {
		ref = strings.TrimSpace(project.DefaultBranch)
	}
	if ref == "" {
		return nil, fmt.Errorf("gitlab default branch unavailable")
	}
	commit, err := s.resolveCommit(ctx, project.ID, ref)
	if err != nil {
		return nil, err
	}
	if !strings.EqualFold(commit, strings.TrimSpace(expectedCommit)) {
		return nil, fmt.Errorf("import is out of date. re-run preview")
	}

	normalizedCandidatePath := normalizeRepoPath(candidatePath)
	prefix := normalizedCandidatePath
	if prefix != "" {
		prefix += "/"
	}

	unique := make(map[string]struct{})
	files := make([]model.GitLabImportDownloadedFile, 0, len(selectedPaths))
	for _, relPath := range selectedPaths {
		normalizedRel := normalizeRepoPath(relPath)
		if normalizedRel == "" {
			continue
		}
		if _, exists := unique[normalizedRel]; exists {
			continue
		}
		unique[normalizedRel] = struct{}{}
		repoPath := normalizeRepoPath(prefix + normalizedRel)
		content, contentType, err := s.fetchFileContent(ctx, project.ID, repoPath, commit)
		if err != nil {
			return nil, err
		}
		files = append(files, model.GitLabImportDownloadedFile{
			Path:          normalizedRel,
			ContentBase64: base64.StdEncoding.EncodeToString(content),
			ContentType:   contentType,
		})
	}

	return &model.GitLabImportFilesResponse{Files: files}, nil
}

func (s *GitLabImportService) resolveRepositorySnapshot(
	ctx context.Context,
	rawURL string,
) (*model.GitLabImportResolved, []gitLabRepositoryFile, []model.GitLabImportCandidate, error) {
	parsed, err := s.parseURL(rawURL)
	if err != nil {
		return nil, nil, nil, err
	}
	project, err := s.fetchProject(ctx, parsed.repo)
	if err != nil {
		return nil, nil, nil, err
	}
	ref := parsed.ref
	if ref == "" {
		ref = strings.TrimSpace(project.DefaultBranch)
	}
	if ref == "" {
		return nil, nil, nil, fmt.Errorf("gitlab default branch unavailable")
	}
	commit, err := s.resolveCommit(ctx, project.ID, ref)
	if err != nil {
		return nil, nil, nil, err
	}
	files, err := s.listFiles(ctx, project.ID, commit, parsed.path)
	if err != nil {
		return nil, nil, nil, err
	}

	candidates := detectCandidates(files, basename(parsed.repo))
	resolved := &model.GitLabImportResolved{
		Kind:    "gitlab",
		Host:    parsed.host,
		Repo:    parsed.repo,
		Ref:     ref,
		Commit:  commit,
		Path:    parsed.path,
		RepoURL: project.WebURL,
	}
	if resolved.RepoURL == "" && s.baseURL != nil {
		resolved.RepoURL = strings.TrimRight(s.baseURL.String(), "/") + "/" + parsed.repo
	}

	return resolved, files, candidates, nil
}

func (s *GitLabImportService) parseURL(rawURL string) (*parsedGitLabImportURL, error) {
	if !s.Enabled() {
		return nil, fmt.Errorf("gitlab import is not configured")
	}
	input := strings.TrimSpace(rawURL)
	parsed, err := url.Parse(input)
	if err != nil {
		return nil, fmt.Errorf("invalid gitlab url")
	}
	if parsed.Scheme != "https" {
		return nil, fmt.Errorf("gitlab url must use https")
	}
	if !strings.EqualFold(parsed.Host, s.baseURL.Host) {
		return nil, fmt.Errorf("gitlab host is not allowed")
	}

	parts := splitPath(parsed.Path)
	marker := -1
	for i, part := range parts {
		if part == "-" {
			marker = i
			break
		}
	}

	repoParts := parts
	if marker >= 0 {
		repoParts = parts[:marker]
	}
	if len(repoParts) < 2 {
		return nil, fmt.Errorf("invalid gitlab project url")
	}
	repo := strings.Join(repoParts, "/")

	result := &parsedGitLabImportURL{
		host: parsed.Host,
		repo: normalizeRepoPath(repo),
	}
	if marker == -1 {
		return result, nil
	}

	mode := elementAt(parts, marker+1)
	ref := elementAt(parts, marker+2)
	if (mode != "tree" && mode != "blob") || ref == "" {
		return nil, fmt.Errorf("unsupported gitlab url")
	}
	result.ref = ref
	rest := normalizeRepoPath(strings.Join(parts[marker+3:], "/"))
	if mode == "blob" {
		result.path = normalizeRepoPath(path.Dir(rest))
		if result.path == "." {
			result.path = ""
		}
	} else {
		result.path = rest
	}

	return result, nil
}

func (s *GitLabImportService) fetchProject(ctx context.Context, repo string) (*gitLabProjectInfo, error) {
	var payload gitLabProjectInfo
	if err := s.doJSON(ctx, http.MethodGet, fmt.Sprintf("/api/v4/projects/%s", url.PathEscape(repo)), nil, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

func (s *GitLabImportService) resolveCommit(ctx context.Context, projectID int64, ref string) (string, error) {
	var payload gitLabCommitInfo
	if err := s.doJSON(ctx, http.MethodGet, fmt.Sprintf("/api/v4/projects/%d/repository/commits/%s", projectID, url.PathEscape(ref)), nil, &payload); err != nil {
		return "", err
	}
	if payload.ID == "" {
		return "", fmt.Errorf("gitlab commit sha missing")
	}
	return payload.ID, nil
}

func (s *GitLabImportService) listFiles(
	ctx context.Context,
	projectID int64,
	ref string,
	rootPath string,
) ([]gitLabRepositoryFile, error) {
	page := 1
	files := make([]gitLabRepositoryFile, 0)
	for {
		query := url.Values{}
		query.Set("ref", ref)
		query.Set("recursive", "true")
		query.Set("per_page", "100")
		query.Set("page", fmt.Sprintf("%d", page))
		if rootPath != "" {
			query.Set("path", rootPath)
		}

		reqPath := fmt.Sprintf("/api/v4/projects/%d/repository/tree?%s", projectID, query.Encode())
		req, err := s.newRequest(ctx, http.MethodGet, reqPath, nil)
		if err != nil {
			return nil, err
		}
		resp, err := s.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("gitlab tree request failed: %w", err)
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				return nil, fmt.Errorf("read gitlab tree error response: %w", readErr)
			}
			return nil, s.decodeGitLabError("gitlab tree request failed", resp.StatusCode, body)
		}

		var entries []gitLabTreeEntry
		if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("decode gitlab tree response: %w", err)
		}
		resp.Body.Close()

		for _, entry := range entries {
			if entry.Type != "blob" {
				continue
			}
			files = append(files, gitLabRepositoryFile{
				Path: normalizeRepoPath(entry.Path),
				Size: entry.Size,
			})
		}

		nextPage := strings.TrimSpace(resp.Header.Get("X-Next-Page"))
		if nextPage == "" {
			break
		}
		page += 1
	}

	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files, nil
}

func (s *GitLabImportService) decodeGitLabError(prefix string, statusCode int, body []byte) error {
	var payload gitLabErrorResponse
	if err := json.Unmarshal(body, &payload); err == nil {
		if message := normalizeGitLabErrorMessage(payload.Message); message != "" {
			return fmt.Errorf("%s with status %d: %s", prefix, statusCode, message)
		}
		if message := normalizeGitLabErrorMessage(payload.Error); message != "" {
			return fmt.Errorf("%s with status %d: %s", prefix, statusCode, message)
		}
	}

	trimmed := strings.TrimSpace(string(body))
	if trimmed != "" {
		return fmt.Errorf("%s with status %d: %s", prefix, statusCode, trimmed)
	}

	return fmt.Errorf("%s with status %d", prefix, statusCode)
}

func normalizeGitLabErrorMessage(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			msg := normalizeGitLabErrorMessage(item)
			if msg != "" {
				parts = append(parts, msg)
			}
		}
		return strings.Join(parts, "; ")
	case map[string]any:
		parts := make([]string, 0, len(typed))
		for key, item := range typed {
			msg := normalizeGitLabErrorMessage(item)
			if msg != "" {
				parts = append(parts, fmt.Sprintf("%s: %s", key, msg))
			}
		}
		sort.Strings(parts)
		return strings.Join(parts, "; ")
	default:
		return ""
	}
}

func (s *GitLabImportService) fetchFileContent(
	ctx context.Context,
	projectID int64,
	repoPath string,
	ref string,
) ([]byte, string, error) {
	reqPath := fmt.Sprintf(
		"/api/v4/projects/%d/repository/files/%s/raw?ref=%s",
		projectID,
		url.PathEscape(repoPath),
		url.QueryEscape(ref),
	)
	req, err := s.newRequest(ctx, http.MethodGet, reqPath, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("gitlab file request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("gitlab file request failed with status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("read gitlab file response: %w", err)
	}
	contentType := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = "text/plain"
	}
	return data, contentType, nil
}

func (s *GitLabImportService) doJSON(ctx context.Context, method, reqPath string, body io.Reader, out any) error {
	req, err := s.newRequest(ctx, method, reqPath, body)
	if err != nil {
		return err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("gitlab request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("gitlab request failed with status %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode gitlab response: %w", err)
	}
	return nil
}

func (s *GitLabImportService) newRequest(ctx context.Context, method, reqPath string, body io.Reader) (*http.Request, error) {
	target := strings.TrimRight(s.baseURL.String(), "/") + reqPath
	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("PRIVATE-TOKEN", s.config.ImportToken)
	req.Header.Set("Accept", "application/json")
	return req, nil
}

func detectCandidates(files []gitLabRepositoryFile, fallbackName string) []model.GitLabImportCandidate {
	seen := make(map[string]struct{})
	candidates := make([]model.GitLabImportCandidate, 0)
	for _, file := range files {
		lower := strings.ToLower(basename(file.Path))
		if lower != "skill.md" && lower != "skills.md" {
			continue
		}
		candidatePath := normalizeRepoPath(path.Dir(file.Path))
		if candidatePath == "." {
			candidatePath = ""
		}
		key := candidatePath + "::" + normalizeRepoPath(file.Path)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		name := basename(candidatePath)
		if name == "" {
			name = fallbackName
		}
		nameCopy := name
		candidates = append(candidates, model.GitLabImportCandidate{
			Path:        candidatePath,
			ReadmePath:  normalizeRepoPath(file.Path),
			Name:        &nameCopy,
			Description: nil,
		})
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].Path < candidates[j].Path })
	return candidates
}

func normalizeRepoPath(value string) string {
	return strings.Trim(strings.ReplaceAll(strings.TrimSpace(value), "\\", "/"), "/")
}

func splitPath(value string) []string {
	parts := strings.Split(strings.Trim(value, "/"), "/")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		out = append(out, part)
	}
	return out
}

func basename(value string) string {
	normalized := normalizeRepoPath(value)
	if normalized == "" {
		return ""
	}
	parts := strings.Split(normalized, "/")
	return parts[len(parts)-1]
}

func deriveSlug(name string) string {
	var builder strings.Builder
	lastDash := false
	for _, ch := range strings.ToLower(strings.TrimSpace(name)) {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') {
			builder.WriteRune(ch)
			lastDash = false
			continue
		}
		if !lastDash {
			builder.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(builder.String(), "-")
}

func deriveDisplayName(name string) string {
	parts := strings.FieldsFunc(name, func(r rune) bool {
		return r == '-' || r == '_' || r == ' '
	})
	for i, part := range parts {
		if part == "" {
			continue
		}
		parts[i] = strings.ToUpper(part[:1]) + strings.ToLower(part[1:])
	}
	return strings.Join(parts, " ")
}

func elementAt(items []string, index int) string {
	if index < 0 || index >= len(items) {
		return ""
	}
	return items[index]
}
