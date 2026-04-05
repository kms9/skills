import { lazy, Suspense } from 'react'
import { skillsCopy } from '../copy/skills'
import { SkillVersionsPanel } from './SkillVersionsPanel'

type SkillFile = {
  path: string
  size: number
  storageId?: string
  sha256?: string
  contentType?: string
}

type SkillDetailTabsProps = {
  activeTab: 'files' | 'compare' | 'versions'
  setActiveTab: (tab: 'files' | 'compare' | 'versions') => void
  onCompareIntent: () => void
  readmeContent: string | null
  readmeError: string | null
  latestFiles: SkillFile[]
  latestVersion: string | null
  skill: {
    slug: string
    displayName: string
  }
  diffVersions: {
    version: string
    createdAt: number
    changelog: string
  }[] | undefined
  versions: {
    version: string
    createdAt: number
    changelog: string
  }[] | undefined
  isLoadingVersions: boolean
}

const SkillDiffCard = lazy(() =>
  import('./SkillDiffCard').then((module) => ({ default: module.SkillDiffCard })),
)

const SkillFilesPanel = lazy(() =>
  import('./SkillFilesPanel').then((module) => ({ default: module.SkillFilesPanel })),
)

export function SkillDetailTabs({
  activeTab,
  setActiveTab,
  onCompareIntent,
  readmeContent,
  readmeError,
  latestFiles,
  latestVersion,
  skill,
  diffVersions,
  versions,
  isLoadingVersions,
}: SkillDetailTabsProps) {
  const copy = skillsCopy.detail.tabs
  return (
    <div className="card tab-card">
      <div className="tab-header">
        <button
          className={`tab-button${activeTab === 'files' ? ' is-active' : ''}`}
          type="button"
          onClick={() => setActiveTab('files')}
        >
          {copy.files}
        </button>
        <button
          className={`tab-button${activeTab === 'compare' ? ' is-active' : ''}`}
          type="button"
          onClick={() => setActiveTab('compare')}
          onMouseEnter={() => {
            onCompareIntent()
            void import('./SkillDiffCard')
          }}
          onFocus={() => {
            onCompareIntent()
            void import('./SkillDiffCard')
          }}
        >
          {copy.compare}
        </button>
        <button
          className={`tab-button${activeTab === 'versions' ? ' is-active' : ''}`}
          type="button"
          onClick={() => setActiveTab('versions')}
        >
          {copy.versions}
        </button>
      </div>

      {activeTab === 'files' ? (
        <Suspense fallback={<div className="tab-body stat">{copy.loadingFiles}</div>}>
          <SkillFilesPanel
            slug={skill.slug}
            version={latestVersion}
            readmeContent={readmeContent}
            readmeError={readmeError}
            latestFiles={latestFiles}
          />
        </Suspense>
      ) : null}

      {activeTab === 'compare' ? (
        <div className="tab-body">
          <Suspense fallback={<div className="stat">{copy.loadingDiff}</div>}>
            <SkillDiffCard skill={skill} versions={diffVersions ?? []} variant="embedded" />
          </Suspense>
        </div>
      ) : null}

      {activeTab === 'versions' ? (
        <SkillVersionsPanel
          versions={versions}
          isLoading={isLoadingVersions}
          skillSlug={skill.slug}
          currentVersion={latestVersion}
        />
      ) : null}
    </div>
  )
}
