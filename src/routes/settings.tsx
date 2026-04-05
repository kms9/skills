import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsCopy } from '../copy/settings'
import { useAuthStatus } from '../lib/useAuthStatus'
import { gravatarUrl } from '../lib/gravatar'
import { apiRequest, authRequest, ApiError, buildAuthNavigationUrl } from '../lib/apiClient'
import { getFeishuAppId, isFeishuClient, requestFeishuAuthCode } from '../lib/feishuAuth'
import { formatUserStatus } from '../lib/user-status'

export const Route = createFileRoute('/settings')({
  component: Settings,
})

type APIToken = {
  id: string
  label: string
  createdAt: string
  lastUsedAt?: string | null
}

function Settings() {
  const copy = settingsCopy
  const search = Route.useSearch() as { bindError?: string }
  const { isAuthenticated, me, isLoading } = useAuthStatus()
  const queryClient = useQueryClient()
  const [newLabel, setNewLabel] = useState('')
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [bindInfo, setBindInfo] = useState<string | null>(null)
  const [bindError, setBindError] = useState<string | null>(null)

  const resetBindingMessages = () => {
    setBindInfo(null)
    setBindError(null)
  }

  const refreshMe = async () => {
    await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
  }

  const { data: tokensData } = useQuery({
    queryKey: ['users', 'me', 'tokens'],
    queryFn: () => apiRequest<{ tokens: APIToken[] }>('/users/me/tokens'),
    enabled: isAuthenticated,
  })

  const createToken = useMutation({
    mutationFn: (label: string) =>
      apiRequest<{ token: string; id: string; label: string }>('/users/me/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      }),
    onSuccess: (data) => {
      setCreatedToken(data.token)
      setNewLabel('')
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'tokens'] })
    },
  })

  const revokeToken = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/users/me/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'tokens'] })
    },
  })

  const bindFeishu = useMutation({
    mutationFn: async () => {
      const code = await requestFeishuAuthCode()
      return authRequest('/auth/feishu/bind', { code })
    },
    onSuccess: async () => {
      resetBindingMessages()
      setBindInfo(copy.bindings.feishuBound)
      await refreshMe()
    },
    onError: (error) => {
      resetBindingMessages()
      setBindError(error instanceof ApiError ? error.message : (error as Error).message)
    },
  })

  if (isLoading) {
    return (
      <main className="section">
        <div className="card">
          <div className="loading-indicator">{copy.loading}</div>
        </div>
      </main>
    )
  }

  if (!isAuthenticated || !me) {
    return (
      <main className="section">
        <div className="card">{copy.signInRequired}</div>
      </main>
    )
  }

  const avatar = me.image ?? (me.email ? gravatarUrl(me.email, 160) : undefined)
  const identityName = me.displayName ?? me.name ?? me.handle ?? copy.fallbackIdentity
  const statusLabel = formatUserStatus(me.status)
  const tokens = tokensData?.tokens ?? []
  const feishuClient = isFeishuClient()
  const canUseFeishuH5 = feishuClient && !!getFeishuAppId()
  const bindErrorMessage = bindError ?? (typeof search.bindError === 'string' ? search.bindError : null)

  return (
    <main className="section settings-shell">
      <h1 className="section-title">{copy.title}</h1>
      <div className="card settings-profile">
        <div className="settings-avatar">
          {avatar ? (
            <img src={avatar} alt={identityName} />
          ) : (
            <span>{identityName[0]?.toUpperCase() ?? 'U'}</span>
          )}
        </div>
        <div className="settings-profile-body">
          <div className="settings-name">{identityName}</div>
          <div className="settings-handle">{copy.profile.uidLabel}: {me.id}</div>
          <div className="settings-handle">{copy.profile.statusLabel}: {statusLabel}</div>
          {me.email ? <div className="settings-email">{me.email}</div> : null}
        </div>
      </div>

      <div className="card settings-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{copy.profile.title}</h2>
        <p className="section-subtitle">{copy.profile.subtitle}</p>
      </div>

      <div className="card settings-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{copy.bindings.title}</h2>
        <p className="section-subtitle">{copy.bindings.subtitle}</p>

        {bindErrorMessage ? <div className="auth-error">{bindErrorMessage}</div> : null}
        {bindInfo ? <div className="auth-info">{bindInfo}</div> : null}

        <div className="settings-card" style={{ marginTop: 16 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>{copy.bindings.feishuTitle}</h3>
          <p className="section-subtitle">
            {me.feishuBinding?.bound ? copy.bindings.feishuBound : copy.bindings.feishuUnbound}
          </p>
          {me.feishuBinding?.bound ? (
            <div style={{ display: 'grid', gap: 4, fontSize: '0.95rem' }}>
              <span style={{ opacity: 0.7 }}>{copy.bindings.feishuEmailLabel}</span>
              <span>{me.feishuBinding.email ?? copy.bindings.feishuEmailMissing}</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <p className="section-subtitle" style={{ marginBottom: 0 }}>
                {copy.bindings.feishuHint}
              </p>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={bindFeishu.isPending}
                onClick={() => {
                  resetBindingMessages()
                  if (canUseFeishuH5) {
                    bindFeishu.mutate()
                    return
                  }
                  window.location.assign(buildAuthNavigationUrl('/auth/feishu/bind?redirect=/settings'))
                }}
              >
                {bindFeishu.isPending ? copy.bindings.feishuBinding : copy.bindings.feishuAction}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card settings-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>{copy.tokens.title}</h2>
        <p className="section-subtitle">{copy.tokens.subtitle}</p>

        {createdToken && (
          <div className="token-created-banner" style={{ marginBottom: 16, padding: '12px', background: 'var(--color-success-bg, #f0fdf4)', borderRadius: 8 }}>
            <strong>{copy.tokens.createdBanner}</strong>
            <code style={{ display: 'block', marginTop: 8, wordBreak: 'break-all', fontSize: '0.85em' }}>{createdToken}</code>
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setCreatedToken(null)}>{copy.tokens.dismiss}</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="input"
            type="text"
            placeholder={copy.tokens.labelPlaceholder}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={!newLabel.trim() || createToken.isPending}
            onClick={() => createToken.mutate(newLabel.trim())}
          >
            {copy.tokens.create}
          </button>
        </div>

        {tokens.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: '0.9em' }}>{copy.tokens.empty}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tokens.map((t) => (
              <li key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{t.label}</span>
                  <span style={{ marginLeft: 8, opacity: 0.5, fontSize: '0.8em' }}>
                    {copy.tokens.createdAt} {new Date(t.createdAt).toLocaleDateString()}
                    {t.lastUsedAt ? ` · ${copy.tokens.lastUsedAt} ${new Date(t.lastUsedAt).toLocaleDateString()}` : ''}
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => revokeToken.mutate(t.id)}
                  disabled={revokeToken.isPending}
                >
                  {copy.tokens.revoke}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
