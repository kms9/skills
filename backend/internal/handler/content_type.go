package handler

import (
	"mime"
	"path/filepath"
	"strings"
)

var textExtensions = map[string]string{
	".md":   "text/markdown",
	".txt":  "text/plain",
	".json": "application/json",
	".yaml": "text/yaml",
	".yml":  "text/yaml",
	".js":   "text/javascript",
	".ts":   "text/plain",
	".py":   "text/x-python-script",
	".sh":   "text/plain",
}

func normalizeUploadContentType(path string, provided string) string {
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(path)))
	if forced, ok := textExtensions[ext]; ok {
		return forced
	}

	contentType := strings.TrimSpace(provided)
	if contentType == "" || contentType == "application/octet-stream" {
		if guessed := mime.TypeByExtension(ext); guessed != "" {
			return guessed
		}
	}
	if contentType == "" {
		return "application/octet-stream"
	}
	return contentType
}

func normalizeResponseContentType(path string, stored string) string {
	contentType := normalizeUploadContentType(path, stored)
	lower := strings.ToLower(contentType)
	if !strings.Contains(lower, "charset=") &&
		(strings.HasPrefix(lower, "text/") || lower == "application/json") {
		contentType += "; charset=utf-8"
	}
	return contentType
}
