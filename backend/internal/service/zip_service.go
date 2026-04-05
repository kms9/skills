package service

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"time"

	"github.com/openclaw/clawhub/backend/internal/model"
)

type ZipService struct {
	storageService StorageService
}

func NewZipService(storageService StorageService) *ZipService {
	return &ZipService{
		storageService: storageService,
	}
}

func (s *ZipService) GenerateZip(ctx context.Context, skill *model.Skill, version *model.SkillVersion, writer io.Writer) error {
	zipWriter := zip.NewWriter(writer)
	defer zipWriter.Close()

	// Sort files by path for deterministic ordering
	files := make([]model.FileMetadata, len(version.Files))
	copy(files, version.Files)
	sort.Slice(files, func(i, j int) bool {
		return files[i].Path < files[j].Path
	})

	// Add files to ZIP
	for _, file := range files {
		if err := s.addFileToZip(ctx, zipWriter, file); err != nil {
			return fmt.Errorf("failed to add file %s: %w", file.Path, err)
		}
	}

	// Add _meta.json
	if err := s.addMetaFile(zipWriter, skill, version, files); err != nil {
		return fmt.Errorf("failed to add meta file: %w", err)
	}

	return nil
}

func (s *ZipService) addFileToZip(ctx context.Context, zipWriter *zip.Writer, file model.FileMetadata) error {
	// Download file from storage
	reader, err := s.storageService.Download(ctx, file.StorageKey)
	if err != nil {
		return fmt.Errorf("failed to download file: %w", err)
	}
	defer reader.Close()

	// Create ZIP file header with fixed timestamp
	header := &zip.FileHeader{
		Name:     file.Path,
		Method:   zip.Deflate,
		Modified: time.Unix(0, 0), // Unix epoch for deterministic ZIP
	}

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return fmt.Errorf("failed to create zip entry: %w", err)
	}

	if _, err := io.Copy(writer, reader); err != nil {
		return fmt.Errorf("failed to write file content: %w", err)
	}

	return nil
}

func (s *ZipService) addMetaFile(zipWriter *zip.Writer, skill *model.Skill, version *model.SkillVersion, files []model.FileMetadata) error {
	meta := map[string]interface{}{
		"slug":        skill.Slug,
		"displayName": skill.DisplayName,
		"description": skill.Description,
		"version":     version.Version,
		"tags":        skill.Tags,
		"files":       files,
	}

	metaJSON, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal meta: %w", err)
	}

	header := &zip.FileHeader{
		Name:     "_meta.json",
		Method:   zip.Deflate,
		Modified: time.Unix(0, 0),
	}

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return fmt.Errorf("failed to create meta entry: %w", err)
	}

	if _, err := writer.Write(metaJSON); err != nil {
		return fmt.Errorf("failed to write meta content: %w", err)
	}

	return nil
}
