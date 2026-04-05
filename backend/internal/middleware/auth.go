package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/model"
	"github.com/openclaw/clawhub/backend/internal/service"
	"gorm.io/gorm"
)

const CurrentUserKey = "current_user"

// AuthMiddleware optionally authenticates the request.
// If a valid credential is found, it injects *model.User into the context.
// If no credential is present, the request continues unauthenticated.
func AuthMiddleware(authService *service.AuthService, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			c.Next()
			return
		}

		user := resolveToken(c, token, authService, db)
		if user != nil {
			c.Set(CurrentUserKey, user)
		}
		c.Next()
	}
}

// RequireAuth rejects unauthenticated requests with 401.
func RequireAuth(authService *service.AuthService, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token != "" {
			if user := resolveToken(c, token, authService, db); user != nil {
				c.Set(CurrentUserKey, user)
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
	}
}

// GetCurrentUser retrieves the authenticated user from the Gin context.
func GetCurrentUser(c *gin.Context) *model.User {
	val, exists := c.Get(CurrentUserKey)
	if !exists {
		return nil
	}
	user, _ := val.(*model.User)
	return user
}

// extractToken returns the raw token string from Authorization header or session cookie.
func extractToken(c *gin.Context) string {
	if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	if cookie, err := c.Cookie("clawhub_session"); err == nil && cookie != "" {
		return cookie
	}
	return ""
}

// resolveToken tries JWT first, then CLI token lookup.
func resolveToken(c *gin.Context, token string, authService *service.AuthService, db *gorm.DB) *model.User {
	// Try JWT
	claims, err := authService.ParseJWT(token)
	if err == nil {
		sub, ok := claims["sub"].(string)
		if !ok || sub == "" {
			return nil
		}
		var user model.User
		if err := db.First(&user, "id = ?", sub).Error; err != nil {
			return nil
		}
		return &user
	}

	// Try CLI token (SHA-256 hash lookup)
	hash := sha256Token(token)
	var apiToken model.APIToken
	if err := db.Where("token_hash = ?", hash).First(&apiToken).Error; err != nil {
		return nil
	}

	// Update last_used_at asynchronously (best-effort)
	now := time.Now()
	db.Model(&apiToken).Update("last_used_at", now)

	var user model.User
	if err := db.First(&user, "id = ?", apiToken.UserID).Error; err != nil {
		return nil
	}
	return &user
}

func sha256Token(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
