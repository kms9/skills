package service

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/openclaw/clawhub/backend/internal/model"
)

type SessionService struct {
	jwtSecret   []byte
	frontendURL string
}

func NewSessionService(jwtSecret, frontendURL string) *SessionService {
	return &SessionService{
		jwtSecret:   []byte(jwtSecret),
		frontendURL: frontendURL,
	}
}

func (s *SessionService) IssueJWT(user *model.User) (string, error) {
	claims := jwt.MapClaims{
		"sub":      user.ID,
		"handle":   user.Handle,
		"role":     user.Role,
		"provider": user.AuthProvider,
		"iss":      "clawhub",
		"aud":      "clawhub-web",
		"iat":      time.Now().Unix(),
		"exp":      time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *SessionService) ParseJWT(tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

func (s *SessionService) FrontendURL() string {
	return s.frontendURL
}
