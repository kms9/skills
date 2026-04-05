import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { mySkillsCopy } from '../../../copy/my-skills'
import { apiRequest } from '../../../lib/apiClient'
import { useAuthStatus } from '../../../lib/useAuthStatus'
import type { ManagedSkillListResponse } from '../../../types/api'

export const Route = createFileRoute('/my/skills/')({
  component: MySkillsPage,
  validateSearch: (search) => ({
    status: typeof search.status === 'string' ? search.status : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
})

function MySkillsPage() {
  const copy = mySkillsCopy.list
  const { me, isLoading } = useAuthStatus()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const status = search.status ?? 'all'
  const q = search.q ?? ''

  const skillsQuery = useQuery({
    queryKey: ['my', 'skills', status, q],
    queryFn: () => {
      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      if (q.trim()) params.set('q', q.trim())
      const suffix = params.toString()
      return apiRequest<ManagedSkillListResponse>(`/my/skills${suffix ? `?${suffix}` : ''}`)
    },
    enabled: !!me,
    retry: false,
  })

  const action = useMutation({
    mutationFn: async ({ slug, type }: { slug: string; type: 'delete' | 'undelete' }) =>
      apiRequest(`/skills/${slug}${type === 'undelete' ? '/undelete' : ''}`, {
        method: type === 'delete' ? 'DELETE' : 'POST',
        headers: type === 'undelete' ? { 'Content-Type': 'application/json' } : undefined,
        body: type === 'undelete' ? JSON.stringify({}) : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my', 'skills'] })
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

  const items = skillsQuery.data?.items ?? []

  return (
    <main className="section">
      <div className="dashboard-header">
        <div>
          <h1 className="section-title" style={{ margin: 0 }}>
            {copy.title}
          </h1>
          <p className="section-subtitle">{copy.subtitle}</p>
        </div>
        <Link to="/upload" search={{ updateSlug: undefined }} className="btn btn-primary">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {copy.uploadNew}
        </Link>
      </div>

      <div className="card" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {['all', 'active', 'deleted'].map((value) => (
            <button
              key={value}
              className={`btn ${status === value ? 'btn-primary' : 'btn-ghost'}`}
              type="button"
              onClick={() =>
                void navigate({
                  to: '/my/skills',
                  search: (prev) => ({ ...prev, status: value === 'all' ? undefined : value }),
                })
              }
            >
              {value === 'all' ? copy.filters.all : value === 'active' ? copy.filters.active : copy.filters.deleted}
            </button>
          ))}
          <input
            className="search-input"
            value={q}
            onChange={(event) =>
              void navigate({
                to: '/my/skills',
                search: (prev) => ({ ...prev, q: event.target.value || undefined }),
              })
            }
            placeholder={copy.filters.searchPlaceholder}
            style={{ maxWidth: 280 }}
          />
        </div>

        {skillsQuery.isLoading ? <div className="loading-indicator">{copy.loading}</div> : null}
        {skillsQuery.error ? <div className="form-error">{copy.loadFailed}</div> : null}
        {!skillsQuery.isLoading && items.length === 0 ? (
          <p style={{ opacity: 0.7 }}>{copy.empty}</p>
        ) : null}

        {items.map((skill) => (
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
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{skill.displayName}</strong>
                <span className="dashboard-skill-slug">/{skill.slug}</span>
                <span className="tag">{skill.status}</span>
              </div>
              {skill.summary ? <div style={{ opacity: 0.7, marginTop: 4 }}>{skill.summary}</div> : null}
              <div className="stat" style={{ marginTop: 6 }}>
                {copy.currentVersion}：v{skill.latestVersion?.version ?? '—'} · {copy.updatedAt}{' '}
                {new Date(skill.updatedAt * 1000).toLocaleString()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to="/my/skills/$slug" params={{ slug: skill.slug }} className="btn btn-sm">
                {copy.actions.manage}
              </Link>
              <Link to="/upload" search={{ updateSlug: skill.slug }} className="btn btn-sm">
                {copy.actions.newVersion}
              </Link>
              <Link to="/$owner/$slug" params={{ owner: me.handle, slug: skill.slug }} className="btn btn-ghost btn-sm">
                {copy.actions.view}
              </Link>
              {skill.isDeleted ? (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ slug: skill.slug, type: 'undelete' })}
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  {copy.actions.restore}
                </button>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ slug: skill.slug, type: 'delete' })}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  {copy.actions.delete}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
