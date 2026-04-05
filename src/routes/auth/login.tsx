import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authCopy, mapAuthErrorMessage, mapOAuthAuthErrorMessage } from '../../copy/auth'
import { authRequest, ApiError, buildAuthNavigationUrl } from '../../lib/apiClient'
import { getFeishuAppId, isFeishuClient, requestFeishuAuthCode } from '../../lib/feishuAuth'

export const Route = createFileRoute('/auth/login')({
  component: AuthPage,
})

function AuthPage() {
  const copy = authCopy
  const search = Route.useSearch() as { redirect?: string; authError?: string }
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const autoStartedRef = useRef(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const redirect = typeof search.redirect === 'string' ? search.redirect : undefined
  const authError = typeof search.authError === 'string' ? search.authError : undefined
  const feishuClient = isFeishuClient()
  const canUseFeishuH5 = feishuClient && !!getFeishuAppId()

  const finishLogin = () => {
    if (redirect) {
      window.location.assign(redirect)
      return
    }
    void navigate({ to: '/' })
  }

  const resetMessages = () => {
    setError(null)
    setInfo(null)
  }

  const handleFeishuLogin = async () => {
    resetMessages()
    if (!feishuClient) {
      const path = redirect
        ? `/auth/feishu?redirect=${encodeURIComponent(redirect)}`
        : '/auth/feishu'
      const target = buildAuthNavigationUrl(path)
      window.location.assign(target)
      return
    }
    setLoading(true)
    try {
      const code = await requestFeishuAuthCode()
      await authRequest('/auth/feishu/h5-login', { code })
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      finishLogin()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? mapAuthErrorMessage(err.message)
          : (err as Error).message || copy.errors.feishuLoginFailed,
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canUseFeishuH5 || autoStartedRef.current) return
    autoStartedRef.current = true
    setInfo(copy.info.feishuAutoStarted)
    void handleFeishuLogin()
  }, [canUseFeishuH5])

  const oauthStatusMessage = mapOAuthAuthErrorMessage(authError)

  return (
    <main className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <img src="/clawd-logo.png" alt="" aria-hidden="true" />
          </div>
          <span className="auth-brand-name">{copy.brandName}</span>
        </div>

        <div className="auth-card">
          <div className="auth-view-enter">
            <div className="auth-card-header">
              <h1 className="auth-card-title">{copy.entry.title}</h1>
              <p className="auth-card-subtitle">{copy.entry.subtitle}</p>
            </div>

            {oauthStatusMessage ? <div className="auth-error">{oauthStatusMessage}</div> : null}
            {error ? <div className="auth-error">{error}</div> : null}
            {info ? <div className="auth-info">{info}</div> : null}

            <div className="auth-form">
              <button
                className="auth-btn auth-btn-primary"
                type="button"
                onClick={() => void handleFeishuLogin()}
                disabled={loading || (feishuClient && !canUseFeishuH5)}
              >
                {loading ? copy.entry.primaryLoading : copy.entry.feishu}
              </button>
              <p className="auth-card-subtitle" style={{ marginBottom: 0 }}>
                {copy.entry.feishuHint}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
