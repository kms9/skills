import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { RotateCcw, Trash2 } from 'lucide-react'
import { managementCopy } from '../copy/management'
import { ApiError, apiRequest } from '../lib/apiClient'
import { useAuthStatus } from '../lib/useAuthStatus'
import type { ManagedSkillListResponse } from '../types/api'

export const Route = createFileRoute('/management')({
  component: Management,
  validateSearch: (search) => ({
    status: typeof search.status === 'string' ? search.status : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
})

async function fetchAdminSkills(status?: string, q?: string) {
  const search = new URLSearchParams()
  if (status) search.set('status', status)
  if (q) search.set('q', q)
  return apiRequest<ManagedSkillListResponse>(`/admin/skills?${search.toString()}`)
}

function formatOwnerLabel(skill: ManagedSkillListResponse['items'][number], unknownOwner: string) {
  const email = skill.owner?.email?.trim()
  if (email) {
    return email
  }

  const handle = skill.owner?.handle?.trim()
  if (handle) {
    return `@${handle}`
  }

  return unknownOwner
}

function Management() {
  const copy = managementCopy
  const { me, isLoading } = useAuthStatus()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const status = search.status ?? 'all'
  const q = search.q ?? ''

  const skillListQuery = useQuery({
    queryKey: ['admin', 'skills', status, q],
    queryFn: () => fetchAdminSkills(status === 'all' ? undefined : status, q.trim() || undefined),
    enabled: !!me,
    retry: false,
  })

  const skillAction = useMutation({
    mutationFn: ({ slug, type }: { slug: string; type: 'delete' | 'undelete' }) =>
      apiRequest(`/admin/skills/${slug}/${type === 'delete' ? 'delete' : 'undelete'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'skills'] })
    },
  })

  const highlightedAction = useMutation({
    mutationFn: ({ slug, highlighted }: { slug: string; highlighted: boolean }) =>
      apiRequest(`/admin/skills/${slug}/highlighted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlighted }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'skills'] })
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

  if (!me) {
    return (
      <main className="section">
        <div className="card">{copy.signInRequired}</div>
      </main>
    )
  }

  const permissionError = skillListQuery.error instanceof ApiError && skillListQuery.error.status === 403
  if (permissionError) {
    return (
      <main className="section">
        <div className="card">{copy.noAccess}</div>
      </main>
    )
  }

  const renderSkillActions = (skill: { slug: string; isDeleted: boolean; highlighted: boolean }) => (
    <>
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        disabled={highlightedAction.isPending}
        onClick={() => highlightedAction.mutate({ slug: skill.slug, highlighted: !skill.highlighted })}
      >
        {skill.highlighted ? copy.actions.unhighlight : copy.actions.highlight}
      </button>
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        disabled={skillAction.isPending}
        onClick={() => skillAction.mutate({ slug: skill.slug, type: skill.isDeleted ? 'undelete' : 'delete' })}
      >
        {skill.isDeleted ? <RotateCcw className="h-3 w-3" aria-hidden="true" /> : <Trash2 className="h-3 w-3" aria-hidden="true" />}
        {skill.isDeleted ? copy.actions.restore : copy.actions.delete}
      </button>
    </>
  )

  return (
    <main className="section">
      <h1 className="section-title">{copy.title}</h1>
      <p className="section-subtitle">{copy.subtitle}</p>

      <div className="card" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ opacity: 0.7 }}>
          {copy.signedInAs} <strong>@{me.handle}</strong>
          {me.isSuperuser ? ` ${copy.superuserTag}` : ''}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            className="search-input"
            value={status}
            onChange={(event) =>
              void navigate({
                to: '/management',
                search: (prev) => ({ ...prev, status: event.target.value === 'all' ? undefined : event.target.value }),
              })
            }
            style={{ maxWidth: 220 }}
          >
            <option value="all">{copy.filters.skills.all}</option>
            <option value="active">{copy.filters.skills.active}</option>
            <option value="deleted">{copy.filters.skills.deleted}</option>
          </select>

          <input
            className="search-input"
            value={q}
            onChange={(event) =>
              void navigate({
                to: '/management',
                search: (prev) => ({ ...prev, q: event.target.value || undefined }),
              })
            }
            placeholder={copy.filters.skills.searchPlaceholder}
            style={{ maxWidth: 280 }}
          />
        </div>

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {skillListQuery.isLoading ? <div className="loading-indicator">{copy.skills.loading}</div> : null}
          {skillListQuery.error && !(skillListQuery.error instanceof ApiError) ? <p className="form-error">{copy.skills.loadFailed}</p> : null}
          {skillListQuery.data?.items.map((skill) => (
            <article
              key={skill.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '1rem',
                display: 'grid',
                gap: '0.75rem',
              }}
            >
              <div>
                <strong>{skill.displayName}</strong>
                <div style={{ opacity: 0.7 }}>
                  /{skill.slug} · {copy.skills.ownerPrefix}：{formatOwnerLabel(skill, copy.skills.unknownOwner)} · {copy.skills.statusPrefix}：{skill.status}
                </div>
                <div className="stat">
                  v{skill.latestVersion?.version ?? '—'} · {copy.skills.versionsPrefix} {skill.stats.versions} · {copy.skills.highlightedPrefix}：
                  {skill.highlighted ? copy.skills.highlightedYes : copy.skills.highlightedNo}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {renderSkillActions(skill)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}
