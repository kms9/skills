import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { RotateCcw, Trash2, Upload } from 'lucide-react'
import { mySkillsCopy } from '../../../copy/my-skills'
import { apiRequest } from '../../../lib/apiClient'
import { useAuthStatus } from '../../../lib/useAuthStatus'
import type { ManagedSkillDetailResponse } from '../../../types/api'

export const Route = createFileRoute('/my/skills/$slug')({
  component: MySkillDetailPage,
})

function MySkillDetailPage() {
  const copy = mySkillsCopy.detail
  const { me, isLoading } = useAuthStatus()
  const { slug } = Route.useParams()
  const queryClient = useQueryClient()

  const detailQuery = useQuery({
    queryKey: ['my', 'skills', 'detail', slug],
    queryFn: () => apiRequest<ManagedSkillDetailResponse>(`/my/skills/${slug}`),
    enabled: !!me,
    retry: false,
  })

  const action = useMutation({
    mutationFn: async (type: 'delete' | 'undelete') =>
      apiRequest(`/skills/${slug}${type === 'undelete' ? '/undelete' : ''}`, {
        method: type === 'delete' ? 'DELETE' : 'POST',
        headers: type === 'undelete' ? { 'Content-Type': 'application/json' } : undefined,
        body: type === 'undelete' ? JSON.stringify({}) : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my', 'skills'] })
      await queryClient.invalidateQueries({ queryKey: ['my', 'skills', 'detail', slug] })
      await queryClient.invalidateQueries({ queryKey: ['skills', 'detail', slug] })
    },
  })

  if (isLoading) {
    return (
      <main className="section">
        <div className="card">
          <div className="loading-indicator">{copy.loadingPage}</div>
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

  if (detailQuery.isLoading) {
    return (
      <main className="section">
        <div className="card">
          <div className="loading-indicator">{copy.loadingSkill}</div>
        </div>
      </main>
    )
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <main className="section">
        <div className="card">{copy.unavailable}</div>
      </main>
    )
  }

  const { skill, versions } = detailQuery.data

  return (
    <main className="section">
      <div className="dashboard-header">
        <div>
          <h1 className="section-title" style={{ margin: 0 }}>
            {skill.displayName}
          </h1>
          <p className="section-subtitle">
            /{skill.slug} · {copy.statusPrefix}：{skill.status}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to="/upload" search={{ updateSlug: skill.slug }} className="btn btn-primary">
            <Upload className="h-4 w-4" aria-hidden="true" />
            {copy.uploadNewVersion}
          </Link>
          <Link to="/$owner/$slug" params={{ owner: me.handle, slug: skill.slug }} className="btn btn-ghost">
            {copy.viewPublicPage}
          </Link>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <strong>{copy.currentVersion}</strong>
          <div className="stat">v{skill.latestVersion?.version ?? '—'}</div>
        </div>
        <div>
          <strong>{copy.updatedAt}</strong>
          <div className="stat">{new Date(skill.updatedAt * 1000).toLocaleString()}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {skill.isDeleted ? (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={action.isPending}
              onClick={() => action.mutate('undelete')}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {copy.restoreSkill}
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={action.isPending}
              onClick={() => action.mutate('delete')}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {copy.deleteSkill}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: '1rem' }}>
        <h2 className="section-title" style={{ margin: 0, fontSize: '1.2rem' }}>
          {copy.versions}
        </h2>
        {versions.length === 0 ? <div className="stat">{copy.noVersions}</div> : null}
        {versions.map((version) => (
          <article
            key={version.version}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '1rem',
              display: 'grid',
              gap: '0.5rem',
            }}
          >
            <div>
              <strong>v{version.version}</strong>
              {version.version === skill.latestVersion?.version ? (
                <span style={{ color: 'var(--ink-soft)' }}> · {copy.currentTag}</span>
              ) : null}
            </div>
            <div className="stat">{new Date(version.createdAt * 1000).toLocaleString()}</div>
            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-soft)' }}>{version.changelog}</div>
            <div>
              <a
                className="btn btn-sm"
                href={`/api/v1/download?slug=${encodeURIComponent(skill.slug)}&version=${encodeURIComponent(version.version)}`}
              >
                {copy.downloadZip}
              </a>
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
