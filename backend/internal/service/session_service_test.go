package service

import (
	"testing"

	"github.com/openclaw/clawhub/backend/internal/model"
)

func TestSessionServiceIssueAndParseJWT(t *testing.T) {
	service := NewSessionService("test-secret", "http://localhost:10091")
	user := &model.User{
		ID:           "user-1",
		Handle:       "tester",
		Role:         "admin",
		AuthProvider: "gitlab",
	}

	token, err := service.IssueJWT(user)
	if err != nil {
		t.Fatalf("IssueJWT() error = %v", err)
	}

	claims, err := service.ParseJWT(token)
	if err != nil {
		t.Fatalf("ParseJWT() error = %v", err)
	}

	if claims["sub"] != user.ID {
		t.Fatalf("expected sub %q, got %v", user.ID, claims["sub"])
	}
	if claims["provider"] != user.AuthProvider {
		t.Fatalf("expected provider %q, got %v", user.AuthProvider, claims["provider"])
	}
}
