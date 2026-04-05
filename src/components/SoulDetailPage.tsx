import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { soulsCopy } from '../copy/souls'
import { SoulStatsTripletLine } from './SoulStats'
import type { PublicSoul, PublicUser } from '../lib/publicUser'
import { isModerator } from '../lib/roles'
import { useAuthStatus } from '../lib/useAuthStatus'
import { stripFrontmatter } from '../lib/badges'

type SoulDetailPageProps = {
  slug: string
}

type SoulBySlugResult = {
  soul: PublicSoul
  latestVersion: {
    version: string
    createdAt: number
    changelog: string
  } | null
  owner: PublicUser | null
} | null

export function SoulDetailPage({ slug }: SoulDetailPageProps) {
  const copy = soulsCopy.detail
  const { isAuthenticated, me } = useAuthStatus()

  // Phase 1: Placeholder soul data
  const result: SoulBySlugResult | null = null
  const isLoadingSoul = false

  const [readme, setReadme] = useState<string | null>(null)
  const [readmeError, setReadmeError] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const soul = result?.soul
  const owner = result?.owner
  const latestVersion = result?.latestVersion

  // Phase 1: Placeholder versions and comments
  const versions: typeof latestVersion[] = []
  const comments: Array<{ comment: { body: string; _id: string; userId: string }; user: PublicUser | null }> = []

  const readmeContent = useMemo(() => {
    if (!readme) return null
    return stripFrontmatter(readme)
  }, [readme])

  useEffect(() => {
    // Phase 1: Placeholder readme loading
    if (!latestVersion) return
    setReadme(copy.summaryFallbackReadme)
    setReadmeError(null)
  }, [latestVersion, copy.summaryFallbackReadme])

  if (isLoadingSoul) {
    return (
      <main className="section">
        <div className="card">
          <div className="loading-indicator">{copy.loading}</div>
        </div>
      </main>
    )
  }

  if (result === null || !soul) {
    return (
      <main className="section">
        <div className="card">{copy.notFound}</div>
      </main>
    )
  }

  const ownerHandle = owner?.handle ?? owner?.name ?? null

  return (
    <main className="section">
      <div className="skill-detail-stack">
        <div className="card skill-hero">
          <div className="skill-hero-header">
            <div className="skill-hero-title">
              <h1 className="section-title" style={{ margin: 0 }}>
                {soul.displayName}
              </h1>
              <p className="section-subtitle">{soul.summary ?? copy.noSummary}</p>
              <div className="stat">
                <SoulStatsTripletLine stats={soul.stats} versionSuffix="版本" />
              </div>
              {ownerHandle ? (
                <div className="stat">
                  {copy.authorPrefix} <a href={`/u/${ownerHandle}`}>@{ownerHandle}</a>
                </div>
              ) : null}
              <div className="skill-actions">
                {isAuthenticated ? (
                  <button
                    className="star-toggle"
                    type="button"
                    onClick={() => {
                      console.log('Star functionality coming in Phase 2')
                    }}
                    aria-label={false ? copy.unstar : copy.star}
                  >
                    <span aria-hidden="true">★</span>
                  </button>
                ) : null}
              </div>
            </div>
            <div className="skill-hero-cta">
              <div className="skill-version-pill">
                <span className="skill-version-label">{copy.currentVersion}</span>
                <strong>v{latestVersion?.version ?? '—'}</strong>
              </div>
              <a
                className="btn btn-primary"
                href={`/api/v1/souls/${soul.slug}/file?path=SOUL.md`}
                aria-label={copy.downloadSoulAria}
              >
                {copy.downloadSoul}
              </a>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
            {copy.versions}
          </h2>
          <div className="version-scroll">
            <div className="version-list">
              {versions.length === 0 ? (
                <div className="stat">{copy.noVersions}</div>
              ) : (
                versions.map((version) => (
                  <div key={(version as any)._id} className="version-row">
                    <div className="version-info">
                      <div>
                        v{version?.version} · {new Date((version as any)?.createdAt ?? Date.now()).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
            {copy.comments}
          </h2>
          {isAuthenticated ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                console.log('Comment functionality coming in Phase 2')
              }}
              className="comment-form"
            >
              <textarea
                className="comment-input"
                rows={4}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={copy.commentPlaceholder}
              />
              <button className="btn comment-submit" type="submit">
                {copy.postComment}
              </button>
            </form>
          ) : (
            <p className="section-subtitle">{copy.signInToComment}</p>
          )}
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {comments.length === 0 ? (
              <div className="stat">{copy.noComments}</div>
            ) : (
              comments.map((entry) => (
                <div key={entry.comment._id} className="comment-item">
                  <div className="comment-body">
                    <strong>@{entry.user?.handle ?? entry.user?.name ?? 'user'}</strong>
                    <div className="comment-body-text">{entry.comment.body}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
