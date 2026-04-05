package handler

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openclaw/clawhub/backend/internal/middleware"
	"github.com/openclaw/clawhub/backend/internal/service"
	"github.com/sirupsen/logrus"
)

const stateCookieName = "clawhub_oauth_state"
const nonceCookieName = "clawhub_oauth_nonce"
const providerCookieName = "clawhub_oauth_provider"
const sessionCookieName = "clawhub_session"
const redirectCookieName = "clawhub_oauth_redirect"
const feishuBindStateCookieName = "clawhub_feishu_bind_state"
const feishuBindRedirectCookieName = "clawhub_feishu_bind_redirect"

func OAuthLoginHandler(providerName string, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		redirectURI := oauthRedirectURI(c, authService, providerName)
		authRedirect, err := authService.BuildAuthRedirect(providerName, redirectURI)
		if err != nil {
			logrus.WithError(err).WithFields(logrus.Fields{
				"provider":     providerName,
				"redirect_uri": redirectURI,
			}).Warn("failed to build oauth redirect")
			redirectTo := buildOAuthInitErrorRedirect(authService.FrontendURL(), c.Query("redirect"), providerName, err)
			c.Redirect(http.StatusTemporaryRedirect, redirectTo)
			return
		}

		secure := shouldUseSecureCookie(c, authService.FrontendURL())
		c.SetCookie(stateCookieName, authRedirect.State, 600, "/", "", secure, true)
		c.SetCookie(providerCookieName, providerName, 600, "/", "", secure, true)
		if authRedirect.Nonce != "" {
			c.SetCookie(nonceCookieName, authRedirect.Nonce, 600, "/", "", secure, true)
		}

		if redirect := c.Query("redirect"); redirect != "" {
			c.SetCookie(redirectCookieName, redirect, 600, "/", "", secure, true)
		}

		c.Redirect(http.StatusTemporaryRedirect, authRedirect.URL)
	}
}

func OAuthCallbackHandler(providerName string, authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		code := c.Query("code")
		state := c.Query("state")
		secure := shouldUseSecureCookie(c, authService.FrontendURL())

		cookieState, err := c.Cookie(stateCookieName)
		if err != nil || cookieState != state || state == "" {
			logrus.WithFields(logrus.Fields{
				"provider":          providerName,
				"state_present":     state != "",
				"cookie_state_read": err == nil,
			}).Warn("oauth callback rejected due to invalid state")
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid state"})
			return
		}
		storedProvider, err := c.Cookie(providerCookieName)
		if err != nil || storedProvider != providerName {
			logrus.WithFields(logrus.Fields{
				"provider":               providerName,
				"stored_provider_read":   err == nil,
				"stored_provider_actual": storedProvider,
			}).Warn("oauth callback rejected due to invalid provider")
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider"})
			return
		}
		if strings.TrimSpace(code) == "" {
			logrus.WithField("provider", providerName).Warn("oauth callback missing code")
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing code"})
			return
		}
		expectedNonce, _ := c.Cookie(nonceCookieName)

		c.SetCookie(stateCookieName, "", -1, "/", "", secure, true)
		c.SetCookie(providerCookieName, "", -1, "/", "", secure, true)
		c.SetCookie(nonceCookieName, "", -1, "/", "", secure, true)

		user, err := authService.CompleteOAuthLogin(
			c.Request.Context(),
			providerName,
			code,
			oauthRedirectURI(c, authService, providerName),
			expectedNonce,
		)
		if err != nil {
			status, message, phase := classifyOAuthError(providerName, err)
			logrus.WithError(err).WithFields(logrus.Fields{
				"provider": providerName,
				"phase":    phase,
			}).Warn("oauth callback failed")
			c.JSON(status, gin.H{"error": message})
			return
		}
		if err := authService.EnsureLoginAllowed(user); err != nil {
			redirectTo := authService.FrontendURL() + "/auth/login?authError=" + url.QueryEscape(err.Error())
			c.SetCookie(redirectCookieName, "", -1, "/", "", secure, true)
			c.Redirect(http.StatusTemporaryRedirect, redirectTo)
			return
		}

		jwtToken, err := authService.IssueJWT(user)
		if err != nil {
			logrus.WithError(err).WithFields(logrus.Fields{
				"provider": providerName,
				"user_id":  user.ID,
			}).Error("failed to issue oauth session token")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
			return
		}

		maxAge := int(30 * 24 * time.Hour / time.Second)
		c.SetCookie(sessionCookieName, jwtToken, maxAge, "/", "", secure, true)

		redirectTo := authService.FrontendURL()
		if saved, err := c.Cookie(redirectCookieName); err == nil && saved != "" {
			redirectTo = joinRedirectPath(authService.FrontendURL(), saved)
		}
		c.SetCookie(redirectCookieName, "", -1, "/", "", secure, true)
		c.Redirect(http.StatusTemporaryRedirect, redirectTo)
	}
}

func LogoutHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		secure := shouldUseSecureCookie(c, "")
		c.SetCookie(sessionCookieName, "", -1, "/", "", secure, true)
		c.JSON(http.StatusOK, gin.H{"ok": "logged out"})
	}
}

type feishuLoginRequest struct {
	Code string `json:"code" binding:"required"`
}

func FeishuH5LoginHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req feishuLoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code is required"})
			return
		}

		user, err := authService.CompleteFeishuH5Login(c.Request.Context(), req.Code)
		if err != nil {
			status := http.StatusBadGateway
			switch err {
			case service.ErrFeishuAuthDisabled:
				status = http.StatusServiceUnavailable
			}
			logrus.WithError(err).Warn("feishu h5 login failed")
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
		if err := authService.EnsureLoginAllowed(user); err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}

		jwtToken, err := authService.IssueJWT(user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
			return
		}
		maxAge := int(30 * 24 * time.Hour / time.Second)
		secure := shouldUseSecureCookie(c, authService.FrontendURL())
		c.SetCookie(sessionCookieName, jwtToken, maxAge, "/", "", secure, true)
		c.JSON(http.StatusOK, gin.H{
			"ok":     "logged in",
			"handle": user.Handle,
		})
	}
}

func FeishuBindHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		var req feishuLoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code is required"})
			return
		}

		if err := authService.BindFeishuIdentity(c.Request.Context(), user, req.Code); err != nil {
			switch err {
			case service.ErrFeishuAuthDisabled:
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			case service.ErrFeishuIdentityConflict:
				c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			default:
				logrus.WithError(err).Warn("feishu bind failed")
				c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			}
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": "bound"})
	}
}

func FeishuBindLoginHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authRedirect, err := authService.BuildAuthRedirect("feishu", oauthRedirectURI(c, authService, "feishu/bind"))
		if err != nil {
			logrus.WithError(err).Warn("failed to initiate feishu bind")
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to initiate login"})
			return
		}

		secure := shouldUseSecureCookie(c, authService.FrontendURL())
		c.SetCookie(feishuBindStateCookieName, authRedirect.State, 600, "/", "", secure, true)
		if redirect := c.Query("redirect"); redirect != "" {
			c.SetCookie(feishuBindRedirectCookieName, redirect, 600, "/", "", secure, true)
		}
		c.Redirect(http.StatusTemporaryRedirect, authRedirect.URL)
	}
}

func FeishuBindCallbackHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		if user == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}

		code := c.Query("code")
		state := c.Query("state")
		secure := shouldUseSecureCookie(c, authService.FrontendURL())

		cookieState, err := c.Cookie(feishuBindStateCookieName)
		if err != nil || cookieState != state || state == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid state"})
			return
		}
		c.SetCookie(feishuBindStateCookieName, "", -1, "/", "", secure, true)

		if strings.TrimSpace(code) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing code"})
			return
		}

		if err := authService.CompleteOAuthBinding(
			c.Request.Context(),
			user,
			"feishu",
			code,
			oauthRedirectURI(c, authService, "feishu/bind"),
			"",
		); err != nil {
			redirectTo := joinRedirectPath(authService.FrontendURL(), "/settings?bindError="+url.QueryEscape(err.Error()))
			c.SetCookie(feishuBindRedirectCookieName, "", -1, "/", "", secure, true)
			c.Redirect(http.StatusTemporaryRedirect, redirectTo)
			return
		}

		redirectTo := joinRedirectPath(authService.FrontendURL(), "/settings")
		if saved, err := c.Cookie(feishuBindRedirectCookieName); err == nil && saved != "" {
			redirectTo = joinRedirectPath(authService.FrontendURL(), saved)
		}
		c.SetCookie(feishuBindRedirectCookieName, "", -1, "/", "", secure, true)
		c.Redirect(http.StatusTemporaryRedirect, redirectTo)
	}
}

// --- Email auth handlers ---

type registerRequest struct {
	Email       string `json:"email" binding:"required"`
	Password    string `json:"password" binding:"required"`
	DisplayName string `json:"displayName" binding:"required"`
}

func RegisterHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req registerRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email, password, and displayName are required"})
			return
		}

		if err := authService.Register(c.Request.Context(), req.Email, req.Password, req.DisplayName); err != nil {
			switch err {
			case service.ErrEmailDomainNotAllowed, service.ErrPasswordTooShort:
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			case service.ErrEmailAlreadyRegistered:
				c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			case service.ErrEmailAuthDisabled:
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{"error": "registration failed"})
			}
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": "activation email sent"})
	}
}

type activateRequest struct {
	Email string `json:"email" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

func ActivateHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req activateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email and code are required"})
			return
		}

		user, token, err := authService.Activate(c.Request.Context(), req.Email, req.Code)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if token != "" {
			maxAge := int(30 * 24 * time.Hour / time.Second)
			secure := shouldUseSecureCookie(c, authService.FrontendURL())
			c.SetCookie(sessionCookieName, token, maxAge, "/", "", secure, true)
			c.JSON(http.StatusOK, gin.H{
				"ok":     "activated",
				"handle": user.Handle,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":     "pending review",
			"handle": user.Handle,
		})
	}
}

type loginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func EmailLoginHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req loginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email and password are required"})
			return
		}

		user, token, err := authService.LoginWithEmail(c.Request.Context(), req.Email, req.Password)
		if err != nil {
			switch err {
			case service.ErrEmailNotBound:
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			case service.ErrAccountEmailPending, service.ErrAccountReviewPending, service.ErrAccountRejected, service.ErrAccountDisabled:
				c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			default:
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			}
			return
		}

		maxAge := int(30 * 24 * time.Hour / time.Second)
		secure := shouldUseSecureCookie(c, authService.FrontendURL())
		c.SetCookie(sessionCookieName, token, maxAge, "/", "", secure, true)
		c.JSON(http.StatusOK, gin.H{
			"ok":     "logged in",
			"handle": user.Handle,
		})
	}
}

type emailBindRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func EmailBindHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		var req emailBindRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email and password are required"})
			return
		}
		if err := authService.StartEmailBinding(c.Request.Context(), user, req.Email, req.Password); err != nil {
			switch err {
			case service.ErrEmailBindingRequired:
				c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			case service.ErrEmailDomainNotAllowed, service.ErrPasswordTooShort, service.ErrEmailAlreadyBound:
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			case service.ErrEmailAlreadyRegistered:
				c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			case service.ErrEmailAuthDisabled:
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
			default:
				logrus.WithError(err).Warn("email bind failed")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "email binding failed"})
			}
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": "activation email sent"})
	}
}

func EmailActivateBindingHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		var req activateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email and code are required"})
			return
		}
		updatedUser, _, err := authService.CompleteEmailBinding(c.Request.Context(), user, req.Email, req.Code)
		if err != nil {
			switch err {
			case service.ErrEmailBindingRequired:
				c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			case service.ErrEmailAlreadyRegistered:
				c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			default:
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			}
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":     "bound",
			"handle": updatedUser.Handle,
		})
	}
}

func oauthRedirectURI(c *gin.Context, authService *service.AuthService, providerName string) string {
	if baseURL := strings.TrimSpace(authService.OAuthPublicBaseURL()); baseURL != "" {
		return strings.TrimRight(baseURL, "/") + "/auth/" + providerName + "/callback"
	}
	scheme := "http"
	if forwarded := strings.TrimSpace(c.GetHeader("X-Forwarded-Proto")); forwarded != "" {
		scheme = forwarded
	} else if c.Request.TLS != nil {
		scheme = "https"
	}
	host := c.Request.Host
	if forwardedHost := strings.TrimSpace(c.GetHeader("X-Forwarded-Host")); forwardedHost != "" {
		host = forwardedHost
	}
	return scheme + "://" + host + "/auth/" + providerName + "/callback"
}

func shouldUseSecureCookie(c *gin.Context, frontendURL string) bool {
	if c.Request.TLS != nil {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(c.GetHeader("X-Forwarded-Proto")), "https") {
		return true
	}
	return strings.HasPrefix(strings.ToLower(frontendURL), "https://")
}

func joinRedirectPath(baseURL, redirectPath string) string {
	if redirectPath == "" {
		return baseURL
	}
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return baseURL
	}
	relative, err := url.Parse(redirectPath)
	if err != nil {
		return baseURL
	}
	return parsed.ResolveReference(relative).String()
}

func buildOAuthInitErrorRedirect(frontendURL, redirectPath, providerName string, err error) string {
	authError := "failed to initiate login"
	if providerName == "feishu" && strings.Contains(err.Error(), "provider not configured") {
		authError = service.ErrFeishuAuthDisabled.Error()
	}

	loginPath := "/auth/login?authError=" + url.QueryEscape(authError)
	if redirectPath != "" {
		loginPath += "&redirect=" + url.QueryEscape(redirectPath)
	}
	return joinRedirectPath(frontendURL, loginPath)
}

func classifyOAuthError(providerName string, err error) (int, string, string) {
	message := err.Error()
	switch {
	case strings.Contains(message, "provider not configured"):
		return http.StatusBadRequest, "provider not configured", "provider"
	case strings.Contains(message, "token exchange"):
		return http.StatusBadGateway, "failed to exchange " + providerName + " token", "token_exchange"
	case strings.Contains(message, "userinfo"), strings.Contains(message, "claims"), strings.Contains(message, "id token"):
		return http.StatusBadGateway, "failed to read " + providerName + " identity", "identity"
	case strings.Contains(message, "allowed group"):
		return http.StatusForbidden, providerName + " login is not allowed", "authorization"
	case strings.Contains(message, "nonce mismatch"):
		return http.StatusBadRequest, "invalid oauth nonce", "nonce"
	default:
		return http.StatusBadGateway, "failed to complete oauth login", "callback"
	}
}

type resendRequest struct {
	Email string `json:"email" binding:"required"`
}

func ResendActivationHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req resendRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email is required"})
			return
		}

		if err := authService.ResendActivation(c.Request.Context(), req.Email); err != nil {
			msg := err.Error()
			if msg == "please wait before requesting another code" {
				c.JSON(http.StatusTooManyRequests, gin.H{"error": msg})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resend"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": "activation email sent"})
	}
}

func ResendEmailBindingHandler(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetCurrentUser(c)
		if err := authService.ResendEmailBinding(c.Request.Context(), user); err != nil {
			switch err {
			case service.ErrEmailBindingRequired:
				c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			default:
				msg := err.Error()
				if msg == "please wait before requesting another code" {
					c.JSON(http.StatusTooManyRequests, gin.H{"error": msg})
					return
				}
				c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			}
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": "activation email sent"})
	}
}
