type SkillVersionEntry = {
  version: string
  createdAt: number
  changelog: string
}

type SkillVersionsPanelProps = {
  versions: SkillVersionEntry[] | undefined
  isLoading: boolean
  skillSlug: string
  currentVersion: string | null
}

export function SkillVersionsPanel({
  versions,
  isLoading,
  skillSlug,
  currentVersion,
}: SkillVersionsPanelProps) {
  const copy = skillsCopy.detail.versions
  return (
    <div className="tab-body">
      <div>
        <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
          {copy.title}
        </h2>
        <p className="section-subtitle" style={{ margin: 0 }}>
          {copy.subtitle}
        </p>
      </div>
      <div className="version-scroll">
        <div className="version-list">
          {isLoading ? (
            <div className="stat">{copy.loading}</div>
          ) : !versions || versions.length === 0 ? (
            <div className="stat">{copy.empty}</div>
          ) : (
            versions.map((version) => (
              <div key={version.version} className="version-row">
                <div className="version-info">
                  <div>
                    <strong>v{version.version}</strong>
                    {version.version === currentVersion ? (
                      <span style={{ color: 'var(--ink-soft)' }}> · {copy.current}</span>
                    ) : null}
                  </div>
                  <div style={{ color: '#5c554e' }}>
                    {new Date(version.createdAt * 1000).toLocaleDateString()}
                  </div>
                  <div style={{ color: '#5c554e', whiteSpace: 'pre-wrap' }}>{version.changelog}</div>
                </div>
                <div className="version-actions">
                  <a
                    className="btn version-zip"
                    href={`/api/v1/download?slug=${encodeURIComponent(skillSlug)}&version=${encodeURIComponent(version.version)}`}
                  >
                    {copy.zip}
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
import { skillsCopy } from '../copy/skills'
