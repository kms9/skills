import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { SkillCard } from '../../components/SkillCard'
import { SkillStatsTripletLine } from '../../components/SkillStats'
import { userProfileCopy } from '../../copy/user-profile'
import { getSkillBadges } from '../../lib/badges'
import { apiRequest } from '../../lib/apiClient'
import type { PublicSkill } from '../../lib/publicUser'
import type { PublicUserProfile } from '../../types/api'

export const Route = createFileRoute('/u/$handle')({
  component: UserProfile,
})

function UserProfile() {
  const copy = userProfileCopy
  const { handle } = Route.useParams()

  const { data: user, isLoading } = useQuery({
    queryKey: ['users', handle],
    queryFn: () => apiRequest<PublicUserProfile>(`/users/${handle}`),
    retry: false,
  })

  const { data: skillsData } = useQuery({
    queryKey: ['users', handle, 'skills'],
    queryFn: () => apiRequest<{ items: PublicSkill[] }>(`/users/${handle}/skills`),
    enabled: !!user,
  })

  const [tab] = useState<'published'>('published')
  const published = skillsData?.items ?? []

  if (isLoading) {
    return (
      <main className="section">
        <div className="card">
          <div className="loading-indicator">{copy.loading}</div>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="section">
        <div className="card">{copy.notFound}</div>
      </main>
    )
  }

  const avatar = user.avatarUrl
  const displayName = user.displayName ?? user.handle ?? copy.fallbackName
  const displayIdentity = user.email?.trim() || `@${user.handle}`
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <main className="section">
      <div className="card settings-profile" style={{ marginBottom: 22 }}>
        <div className="settings-avatar" aria-hidden="true">
          {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
        </div>
        <div className="settings-profile-body">
          <div className="settings-name">{displayName}</div>
          <div className="settings-handle">{displayIdentity}</div>
          {user.bio ? <div className="settings-bio">{user.bio}</div> : null}
        </div>
      </div>

      <h2 className="section-title" style={{ fontSize: '1.3rem' }}>{copy.publishedTitle}</h2>
      <p className="section-subtitle">{copy.publishedSubtitle}</p>

      {published.length > 0 ? (
        <div className="grid" style={{ marginBottom: 18 }}>
          {published.map((skill) => (
            <SkillCard
              key={skill.slug}
              skill={skill}
              badge={getSkillBadges(skill)}
              summaryFallback={copy.summaryFallback}
              meta={
                <div className="stat">
                  <SkillStatsTripletLine stats={skill.stats} />
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <div className="card">{copy.empty}</div>
      )}
    </main>
  )
}
