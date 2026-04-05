import { Link } from '@tanstack/react-router'
import type { ClawdisSkillMetadata } from 'clawhub-schema'
import { Package } from 'lucide-react'
import { skillsCopy } from '../copy/skills'
import { getSkillBadges } from '../lib/badges'
import { buildNpmInstallCommand } from '../lib/install-command'
import { formatSkillStatsTriplet } from '../lib/numberFormat'
import type { PublicSkill, PublicUser } from '../lib/publicUser'
import { InstallCommandShell } from './InstallCommandShell'
import { type LlmAnalysis, SecurityScanResults } from './SkillSecurityScanResults'
import { SkillInstallCard } from './SkillInstallCard'
import { UserBadge } from './UserBadge'

export type SkillModerationInfo = {
  isPendingScan: boolean
  isMalwareBlocked: boolean
  isSuspicious: boolean
  isHiddenByMod: boolean
  isRemoved: boolean
  reason?: string
}

type SkillFork = {
  kind: 'fork' | 'duplicate'
  version: string | null
  skill: { slug: string; displayName: string }
  owner: { handle: string | null; userId: string | null }
}

type SkillCanonical = {
  skill: { slug: string; displayName: string }
  owner: { handle: string | null; userId: string | null }
}

type SkillVersion = {
  _id?: string
  version: string
  createdAt: number
  changelog: string
  sha256hash?: string | null
  vtAnalysis?: unknown
  llmAnalysis?: unknown
}

type SkillHeaderProps = {
  skill: PublicSkill
  owner: PublicUser | null
  ownerHandle: string | null
  latestVersion: SkillVersion | null
  modInfo: SkillModerationInfo | null
  canManage: boolean
  isAuthenticated: boolean
  isStaff: boolean
  isStarred: boolean | undefined
  onToggleStar: () => void
  onOpenReport: () => void
  forkOf: SkillFork | null
  forkOfLabel: string
  forkOfHref: string | null
  forkOfOwnerHandle: string | null
  canonical: SkillCanonical | null
  canonicalHref: string | null
  canonicalOwnerHandle: string | null
  staffModerationNote: string | null
  staffVisibilityTag: string | null
  isAutoHidden: boolean
  isRemoved: boolean
  nixPlugin: string | undefined
  hasPluginBundle: boolean
  configRequirements: ClawdisSkillMetadata['config'] | undefined
  cliHelp: string | undefined
  tagEntries: Array<[string, string]>
  versionById: Map<string, SkillVersion>
  tagName: string
  onTagNameChange: (value: string) => void
  tagVersionId: string | ''
  onTagVersionChange: (value: string | '') => void
  onTagSubmit: () => void
  tagVersions?: SkillVersion[]
  clawdis: ClawdisSkillMetadata | undefined
  osLabels: string[]
}

export function SkillHeader({
  skill,
  owner,
  ownerHandle,
  latestVersion,
  modInfo,
  canManage,
  isAuthenticated,
  isStaff,
  isStarred,
  onToggleStar,
  onOpenReport,
  forkOf,
  forkOfLabel,
  forkOfHref,
  forkOfOwnerHandle,
  canonical,
  canonicalHref,
  canonicalOwnerHandle,
  staffModerationNote,
  staffVisibilityTag,
  isAutoHidden,
  isRemoved,
  nixPlugin,
  hasPluginBundle,
  configRequirements,
  cliHelp,
  tagEntries,
  versionById,
  tagName,
  onTagNameChange,
  tagVersionId,
  onTagVersionChange,
  onTagSubmit,
  tagVersions,
  clawdis,
  osLabels,
}: SkillHeaderProps) {
  const copy = skillsCopy.detail
  const formattedStats = formatSkillStatsTriplet(skill.stats)
  const safeTagVersions = tagVersions ?? []
  const canShowQuickInstall = !nixPlugin && !modInfo?.isMalwareBlocked && !modInfo?.isRemoved
  const quickInstallCommand = buildNpmInstallCommand(skill.slug)

  return (
    <>
      {modInfo?.isPendingScan ? (
        <div className="pending-banner">
          <div className="pending-banner-content">
            <strong>{copy.pendingScanTitle}</strong>
            <p>{copy.pendingScanBody}</p>
          </div>
        </div>
      ) : modInfo?.isMalwareBlocked ? (
        <div className="pending-banner pending-banner-blocked">
          <div className="pending-banner-content">
            <strong>{copy.maliciousTitle}</strong>
            <p>{copy.maliciousBody}</p>
          </div>
        </div>
      ) : modInfo?.isSuspicious ? (
        <div className="pending-banner pending-banner-warning">
          <div className="pending-banner-content">
            <strong>{copy.suspiciousTitle}</strong>
            <p>{copy.suspiciousBody}</p>
            {canManage ? (
              <p className="pending-banner-appeal">
                {copy.suspiciousAppeal}{' '}
                <a
                  href="https://github.com/openclaw/clawhub/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub issue
                </a>{' '}
              </p>
            ) : null}
          </div>
        </div>
      ) : modInfo?.isRemoved ? (
        <div className="pending-banner pending-banner-blocked">
          <div className="pending-banner-content">
            <strong>{copy.removedTitle}</strong>
            <p>{copy.removedBody}</p>
          </div>
        </div>
      ) : modInfo?.isHiddenByMod ? (
        <div className="pending-banner pending-banner-blocked">
          <div className="pending-banner-content">
            <strong>{copy.hiddenTitle}</strong>
            <p>{copy.hiddenBody}</p>
          </div>
        </div>
      ) : null}

      <div className="card skill-hero">
        <div className={`skill-hero-top${hasPluginBundle ? ' has-plugin' : ''}`}>
          <div className="skill-hero-header">
            <div className="skill-hero-title">
              <div className="skill-hero-kicker-row">
                <span className="skill-slug mono">/{skill.slug}</span>
                {nixPlugin ? <span className="tag tag-accent">{copy.pluginBundle}</span> : null}
              </div>
              <div className="skill-hero-title-row">
                <h1 className="section-title" style={{ margin: 0 }}>
                  {skill.displayName}
                </h1>
              </div>
              <p className="section-subtitle skill-hero-summary">{skill.summary ?? copy.noSummary}</p>

              {isStaff && staffModerationNote ? (
                <div className="skill-hero-note">{staffModerationNote}</div>
              ) : null}
              {nixPlugin ? (
                <div className="skill-hero-note">
                  {copy.pluginBundleNote}
                </div>
              ) : null}

              <div className="skill-hero-meta-grid">
                <div className="skill-meta-block">
                  <span className="skill-meta-label">作者</span>
                  <div className="stat">
                    <UserBadge user={owner} fallbackHandle={ownerHandle} size="md" showName />
                  </div>
                </div>
                <div className="skill-meta-block">
                  <span className="skill-meta-label">热度</span>
                  <div className="stat">
                    ⭐ {formattedStats.stars} · <Package size={14} aria-hidden="true" />{' '}
                    {formattedStats.downloads} · {formattedStats.installs} {copy.cumulativeInstalls}
                  </div>
                </div>
              </div>

              {forkOf && forkOfHref ? (
                <div className="stat skill-hero-line">
                  {forkOfLabel === 'duplicate of' ? copy.duplicateOf : copy.forkOf}{' '}
                  <a href={forkOfHref}>
                    {forkOfOwnerHandle ? `@${forkOfOwnerHandle}/` : ''}
                    {forkOf.skill.slug}
                  </a>
                  {forkOf.version ? `（${copy.basedOn} ${forkOf.version}）` : null}
                </div>
              ) : null}
              {canonicalHref ? (
                <div className="stat skill-hero-line">
                  {copy.canonical}：{' '}
                  <a href={canonicalHref}>
                    {canonicalOwnerHandle ? `@${canonicalOwnerHandle}/` : ''}
                    {canonical?.skill?.slug}
                  </a>
                </div>
              ) : null}

              <div className="skill-badge-row">
                {getSkillBadges(skill).map((badge) => (
                  <div key={badge} className="tag">
                    {badge}
                  </div>
                ))}
                {isStaff && staffVisibilityTag ? (
                  <div className={`tag${isAutoHidden || isRemoved ? ' tag-accent' : ''}`}>
                    {staffVisibilityTag}
                  </div>
                ) : null}
              </div>

              <div className="skill-actions">
                {isAuthenticated ? (
                  <button
                    className={`star-toggle${isStarred ? ' is-active' : ''}`}
                    type="button"
                    onClick={onToggleStar}
                    aria-label={isStarred ? copy.unstar : copy.star}
                  >
                    <span aria-hidden="true">★</span>
                  </button>
                ) : null}
                {isAuthenticated ? (
                  <button className="btn btn-ghost" type="button" onClick={onOpenReport}>
                    {copy.report}
                  </button>
                ) : null}
                {isStaff ? (
                  <Link className="btn" to="/management" search={{ tab: 'skills', q: skill.slug }}>
                    {copy.manage}
                  </Link>
                ) : null}
              </div>
              <SecurityScanResults
                sha256hash={latestVersion?.sha256hash}
                vtAnalysis={latestVersion?.vtAnalysis}
                llmAnalysis={latestVersion?.llmAnalysis as LlmAnalysis | undefined}
              />
              {latestVersion?.sha256hash || latestVersion?.llmAnalysis ? (
                <p className="scan-disclaimer skill-hero-line">
                  {copy.scanDisclaimer}
                </p>
              ) : null}
            </div>
            <div className="skill-hero-cta">
              <div className="skill-version-pill">
                <span className="skill-version-label">{copy.currentVersion}</span>
                <strong>v{latestVersion?.version ?? '—'}</strong>
              </div>
              {!nixPlugin && !modInfo?.isMalwareBlocked && !modInfo?.isRemoved ? (
                <a
                  className="btn btn-primary"
                  href={`/api/v1/download?slug=${encodeURIComponent(skill.slug)}${
                    latestVersion?.version
                      ? `&version=${encodeURIComponent(latestVersion.version)}`
                      : ''
                  }`}
                >
                  {copy.downloadZip}
                </a>
              ) : null}
              {canShowQuickInstall ? (
                <div className="skill-quick-install">
                  <div className="skill-quick-install-copy">
                    <div className="skill-quick-install-title">{copy.quickInstall.title}</div>
                    <p className="section-subtitle skill-quick-install-subtitle">
                      {copy.quickInstall.subtitle}
                    </p>
                  </div>
                  <div className="install-switcher-toggle" role="tablist" aria-label={copy.quickInstall.commandTypeAria}>
                    <span className="install-switcher-pill is-active install-switcher-pill-static">
                      npm
                    </span>
                  </div>
                  <InstallCommandShell
                    command={quickInstallCommand}
                    copyLabel={copy.quickInstall.copy}
                    copiedLabel={copy.quickInstall.copied}
                    copyAriaLabel={copy.quickInstall.copyAriaLabel}
                    copiedAriaLabel={copy.quickInstall.copiedAriaLabel}
                  />
                </div>
              ) : null}
            </div>
          </div>
          {hasPluginBundle ? (
            <div className="skill-panel bundle-card">
              <div className="bundle-header">
                <div className="bundle-title">{copy.pluginBundle}</div>
                <div className="bundle-subtitle">{copy.pluginBundleSubtitle}</div>
              </div>
              <div className="bundle-includes">
                <span>SKILL.md</span>
                <span>CLI</span>
                <span>配置</span>
              </div>
              {configRequirements ? (
                <div className="bundle-section">
                  <div className="bundle-section-title">{copy.configRequirements}</div>
                  <div className="bundle-meta">
                    {configRequirements.requiredEnv?.length ? (
                      <div className="stat">
                        <strong>{copy.requiredEnv}</strong>
                        <span>{configRequirements.requiredEnv.join(', ')}</span>
                      </div>
                    ) : null}
                    {configRequirements.stateDirs?.length ? (
                      <div className="stat">
                        <strong>{copy.stateDirs}</strong>
                        <span>{configRequirements.stateDirs.join(', ')}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {cliHelp ? (
                <details className="bundle-section bundle-details">
                  <summary>{copy.cliHelp}</summary>
                  <pre className="hero-install-code mono">{cliHelp}</pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="skill-tag-row">
          {tagEntries.length === 0 ? (
            <span className="section-subtitle" style={{ margin: 0 }}>
              {copy.noTags}
            </span>
          ) : (
            tagEntries.map(([tag, versionId]) => (
              <span key={tag} className="tag">
                {tag}
                <span className="tag-meta">v{versionById.get(versionId)?.version ?? versionId}</span>
              </span>
            ))
          )}
        </div>

        {canManage ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              onTagSubmit()
            }}
            className="tag-form"
          >
            <input
              className="search-input"
              value={tagName}
              onChange={(event) => onTagNameChange(event.target.value)}
              placeholder="latest"
            />
            <select
              className="search-input"
              value={tagVersionId ?? ''}
              onChange={(event) => onTagVersionChange(event.target.value as string)}
            >
              {safeTagVersions.map((version) => (
                <option
                  key={version._id ?? version.version}
                  value={version._id ?? version.version}
                >
                  v{version.version}
                </option>
              ))}
            </select>
            <button className="btn" type="submit">
              {copy.updateTag}
            </button>
          </form>
        ) : null}

        <SkillInstallCard clawdis={clawdis} osLabels={osLabels} />
      </div>
    </>
  )
}
