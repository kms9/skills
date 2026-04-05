import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { starsCopy } from '../copy/stars'
import { useAuthStatus } from '../lib/useAuthStatus'
import { formatCompactStat } from '../lib/numberFormat'
import { apiRequest } from '../lib/apiClient'
import type { PublicSkill } from '../lib/publicUser'

export const Route = createFileRoute('/stars')({
  component: Stars,
})

function Stars() {
  const copy = starsCopy
  const { isAuthenticated, me, isLoading } = useAuthStatus()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['users', 'me', 'stars'],
    queryFn: () => apiRequest<{ items: PublicSkill[] }>('/users/me/stars'),
    enabled: isAuthenticated,
  })

  const unstar = useMutation({
    mutationFn: (slug: string) =>
      apiRequest(`/skills/${slug}/star`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'stars'] })
    },
  })

  const skills = data?.items ?? []

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

  return (
    <main className="section">
      <h1 className="section-title">{copy.title}</h1>
      <p className="section-subtitle">{copy.subtitle}</p>
      <div className="grid">
        {skills.length === 0 ? (
          <div className="card">{copy.empty}</div>
        ) : (
          skills.map((skill) => {
            const owner = encodeURIComponent(String(skill.ownerUserId))
            return (
              <div key={skill.slug} className="card skill-card">
                <Link to="/$owner/$slug" params={{ owner, slug: skill.slug }}>
                  <h3 className="skill-card-title">{skill.displayName}</h3>
                </Link>
                <div className="skill-card-footer skill-card-footer-inline">
                  <span className="stat">⭐ {formatCompactStat(skill.stats.stars || 0)}</span>
                  <button
                    className="star-toggle is-active"
                    type="button"
                    onClick={() => unstar.mutate(skill.slug)}
                    aria-label={copy.unstarAriaLabel.replace('{name}', skill.displayName)}
                  >
                    <span aria-hidden="true">★</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </main>
  )
}
