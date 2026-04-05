package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	cfg "github.com/openclaw/clawhub/backend/internal/config"
)

type StorageService interface {
	Upload(ctx context.Context, key string, reader io.Reader, contentType string) error
	UploadWithHash(ctx context.Context, key string, reader io.Reader, contentType string) (string, error)
	Download(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
}

type OSSStorageService struct {
	client *s3.Client
	bucket string
}

func NewOSSStorageService(ossCfg cfg.OSSConfig) (*OSSStorageService, error) {
	endpoint := "https://" + ossCfg.Endpoint

	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		if service == "S3" {
			return aws.Endpoint{URL: endpoint}, nil
		}
		return aws.Endpoint{}, fmt.Errorf("unknown service requested")
	})

	creds := credentials.NewStaticCredentialsProvider(
		ossCfg.AccessKeyID,
		ossCfg.AccessKeySecret,
		"",
	)

	awsCfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithCredentialsProvider(creds),
		config.WithEndpointResolverWithOptions(customResolver),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}
	awsCfg.Region = ossCfg.Region

	client := s3.NewFromConfig(awsCfg)

	return &OSSStorageService{
		client: client,
		bucket: ossCfg.Bucket,
	}, nil
}

func (s *OSSStorageService) Upload(ctx context.Context, key string, reader io.Reader, contentType string) error {
	return s.uploadWithRetry(ctx, key, reader, contentType, 3)
}

func (s *OSSStorageService) UploadWithHash(ctx context.Context, key string, reader io.Reader, contentType string) (string, error) {
	hasher := sha256.New()
	teeReader := io.TeeReader(reader, hasher)

	if err := s.uploadWithRetry(ctx, key, teeReader, contentType, 3); err != nil {
		return "", err
	}

	hash := hex.EncodeToString(hasher.Sum(nil))
	return hash, nil
}

func (s *OSSStorageService) uploadWithRetry(ctx context.Context, key string, reader io.Reader, contentType string, maxRetries int) error {
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff
			backoff := time.Duration(1<<uint(attempt-1)) * time.Second
			time.Sleep(backoff)
		}

		_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
			Bucket:      aws.String(s.bucket),
			Key:         aws.String(key),
			Body:        reader,
			ContentType: aws.String(contentType),
		})

		if err == nil {
			return nil
		}

		lastErr = s.handleOSSError(err)

		// Don't retry on authentication errors
		if isAuthError(err) {
			return lastErr
		}
	}

	return fmt.Errorf("upload failed after %d attempts: %w", maxRetries, lastErr)
}

func (s *OSSStorageService) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, s.handleOSSError(err)
	}

	return result.Body, nil
}

func (s *OSSStorageService) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return s.handleOSSError(err)
	}

	return nil
}

func (s *OSSStorageService) handleOSSError(err error) error {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.ErrorCode() {
		case "NoSuchBucket":
			return fmt.Errorf("OSS bucket not found")
		case "InvalidAccessKeyId":
			return fmt.Errorf("OSS authentication failed: invalid access key")
		case "SignatureDoesNotMatch":
			return fmt.Errorf("OSS authentication failed: invalid secret")
		case "RequestTimeTooSkewed":
			return fmt.Errorf("OSS request time skewed, check server time")
		default:
			return fmt.Errorf("OSS error: %s", apiErr.ErrorMessage())
		}
	}
	return err
}

func isAuthError(err error) bool {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		return code == "InvalidAccessKeyId" || code == "SignatureDoesNotMatch"
	}
	return false
}

func GenerateStorageKey(skillID, versionID, filePath string) string {
	return fmt.Sprintf("skills/%s/%s/%s", skillID, versionID, filePath)
}
