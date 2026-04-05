import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { InstallSwitcher } from '../components/InstallSwitcher'
import { SkillCard } from '../components/SkillCard'
import { SkillStatsTripletLine } from '../components/SkillStats'
import { SoulCard } from '../components/SoulCard'
import { SoulStatsTripletLine } from '../components/SoulStats'
import { homeCopy } from '../copy/home'
import { apiRequest } from '../lib/apiClient'
import { mapSkillItemToPublicSkill } from '../lib/apiSkills'
import { getSkillBadges } from '../lib/badges'
import type { PublicSkill, PublicSoul } from '../lib/publicUser'
import { getSiteMode } from '../lib/site'
import type { SkillItem, SkillListResponse } from '../types/api'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const mode = getSiteMode()
  return mode === 'souls' ? <OnlyCrabsHome /> : <SkillsHome />
}

function SkillsHome() {
  const copy = homeCopy.skills
  type SkillPageEntry = {
    skill: PublicSkill
    href: string
  }

  const highlightedQuery = useQuery({
    queryKey: ['homepage', 'skills', 'highlighted'],
    queryFn: () =>
      apiRequest<SkillListResponse>('/skills?highlighted=1&sort=updated&dir=desc&limit=6'),
  })
  const popularQuery = useQuery({
    queryKey: ['homepage', 'skills', 'popular'],
    queryFn: () => apiRequest<SkillListResponse>('/skills?sort=downloads&dir=desc&limit=6'),
  })

  const toEntry = (item: SkillItem): SkillPageEntry => ({
    skill: mapSkillItemToPublicSkill(item),
    href: `/unknown/${encodeURIComponent(item.slug)}`,
  })

  const highlighted = (highlightedQuery.data?.items ?? []).map(toEntry)
  const popular = (popularQuery.data?.items ?? []).map(toEntry)

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy fade-up" data-delay="1">
            <span className="hero-badge">{copy.heroBadge}</span>
            <h1 className="hero-title">{copy.heroTitle}</h1>
            <p className="hero-subtitle">{copy.heroSubtitle}</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <Link to="/upload" search={{ updateSlug: undefined }} className="btn btn-primary">
                {copy.publish}
              </Link>
              <Link
                to="/skills"
                search={{
                  q: undefined,
                  sort: undefined,
                  dir: undefined,
                  highlighted: undefined,
                  nonSuspicious: true,
                  view: undefined,
                  focus: undefined,
                }}
                className="btn"
              >
                {copy.browse}
              </Link>
            </div>
          </div>
          <div className="hero-card hero-search-card fade-up" data-delay="2">
            <div className="hero-install" style={{ marginTop: 18 }}>
              <div className="stat">{copy.searchStat}</div>
              <InstallSwitcher exampleSlug="daily-repot" />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{copy.highlightedTitle}</h2>
        <p className="section-subtitle">{copy.highlightedSubtitle}</p>
        <div className="grid">
          {highlighted.length === 0 ? (
            <div className="card">{copy.highlightedEmpty}</div>
          ) : (
            highlighted.map((entry) => (
              <SkillCard
                key={entry.skill._id}
                skill={entry.skill}
                badge={getSkillBadges(entry.skill)}
                summaryFallback={copy.highlightedSummaryFallback}
                href={entry.href}
                meta={
                  <div className="skill-card-footer-rows">
                    <div className="stat">
                      <SkillStatsTripletLine stats={entry.skill.stats} />
                    </div>
                  </div>
                }
              />
            ))
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{copy.popularTitle}</h2>
        <p className="section-subtitle">{copy.popularSubtitle}</p>
        <div className="grid">
          {popular.length === 0 ? (
            <div className="card">{copy.popularEmpty}</div>
          ) : (
            popular.map((entry) => (
              <SkillCard
                key={entry.skill._id}
                skill={entry.skill}
                summaryFallback={copy.popularSummaryFallback}
                href={entry.href}
                meta={
                  <div className="skill-card-footer-rows">
                    <div className="stat">
                      <SkillStatsTripletLine stats={entry.skill.stats} />
                    </div>
                  </div>
                }
              />
            ))
          )}
        </div>
        <div className="section-cta">
          <Link
            to="/skills"
            search={{
              q: undefined,
              sort: undefined,
              dir: undefined,
              highlighted: undefined,
              nonSuspicious: true,
              view: undefined,
              focus: undefined,
            }}
            className="btn"
          >
            {copy.seeAll}
          </Link>
        </div>
      </section>
    </main>
  )
}

function OnlyCrabsHome() {
  const copy = homeCopy.souls
  const navigate = Route.useNavigate()
  const [query, setQuery] = useState('')
  const trimmedQuery = useMemo(() => query.trim(), [query])

  // Phase 1: Placeholder data
  const latest: PublicSoul[] = []

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy fade-up" data-delay="1">
            <span className="hero-badge">{copy.heroBadge}</span>
            <h1 className="hero-title">{copy.heroTitle}</h1>
            <p className="hero-subtitle">{copy.heroSubtitle}</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <Link to="/upload" search={{ updateSlug: undefined }} className="btn btn-primary">
                {copy.publish}
              </Link>
              <Link
                to="/souls"
                search={{
                  q: undefined,
                  sort: undefined,
                  dir: undefined,
                  view: undefined,
                  focus: undefined,
                }}
                className="btn"
              >
                {copy.browse}
              </Link>
            </div>
          </div>
          <div className="hero-card hero-search-card fade-up" data-delay="2">
            <form
              className="search-bar"
              onSubmit={(event) => {
                event.preventDefault()
                void navigate({
                  to: '/souls',
                  search: {
                    q: trimmedQuery || undefined,
                    sort: undefined,
                    dir: undefined,
                    view: undefined,
                    focus: undefined,
                  },
                })
              }}
            >
              <span className="mono">/</span>
              <input
                className="search-input"
                placeholder={copy.searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </form>
            <div className="hero-install" style={{ marginTop: 18 }}>
              <div className="stat">{copy.searchStat}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{copy.latestTitle}</h2>
        <p className="section-subtitle">{copy.latestSubtitle}</p>
        <div className="grid">
          {latest.length === 0 ? (
            <div className="card">{copy.latestEmpty}</div>
          ) : (
            latest.map((soul) => (
              <SoulCard
                key={soul._id}
                soul={soul}
                summaryFallback={copy.latestSummaryFallback}
                meta={
                  <div className="stat">
                    <SoulStatsTripletLine stats={soul.stats} />
                  </div>
                }
              />
            ))
          )}
        </div>
        <div className="section-cta">
          <Link
            to="/souls"
            search={{
              q: undefined,
              sort: undefined,
              dir: undefined,
              view: undefined,
              focus: undefined,
            }}
            className="btn"
          >
            {copy.seeAll}
          </Link>
        </div>
      </section>
    </main>
  )
}
