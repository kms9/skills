import { useEffect, useMemo, useState } from 'react'
import { skillsCopy } from '../copy/skills'
import { useSkillVersion } from '../hooks/useSkillVersion'
import {
  buildFileDiffList,
  getDefaultDiffSelection,
  selectDefaultFilePath,
  sortVersionsBySemver,
  type FileMeta,
} from '../lib/diffing'
import { getSkillFileText } from '../lib/skillFiles'

type SkillDiffCardProps = {
  skill: {
    slug: string
    displayName: string
  }
  versions: Array<{
    version: string
    createdAt: number
    changelog: string
  }>
  variant?: 'card' | 'embedded'
}

function toFileMeta(files?: Array<{ path: string; sha256: string; size: number }> | null): FileMeta[] {
  return (files ?? []).map((file) => ({
    path: file.path,
    sha256: file.sha256,
    size: file.size,
  }))
}

export function SkillDiffCard({ skill, versions, variant = 'card' }: SkillDiffCardProps) {
  const copy = skillsCopy.detail.diff
  const orderedVersions = useMemo(
    () => sortVersionsBySemver(versions.map((version) => ({ id: version.version, version: version.version }))),
    [versions],
  )
  const defaultSelection = useMemo(
    () => getDefaultDiffSelection(orderedVersions),
    [orderedVersions],
  )

  const [leftVersion, setLeftVersion] = useState<string | null>(defaultSelection.leftId)
  const [rightVersion, setRightVersion] = useState<string | null>(defaultSelection.rightId)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [leftContent, setLeftContent] = useState<string | null>(null)
  const [rightContent, setRightContent] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isLoadingFile, setIsLoadingFile] = useState(false)

  useEffect(() => {
    setLeftVersion(defaultSelection.leftId)
    setRightVersion(defaultSelection.rightId)
  }, [defaultSelection.leftId, defaultSelection.rightId])

  const leftVersionQuery = useSkillVersion(skill.slug, leftVersion, {
    enabled: Boolean(leftVersion),
  })
  const rightVersionQuery = useSkillVersion(skill.slug, rightVersion, {
    enabled: Boolean(rightVersion),
  })

  const diffItems = useMemo(() => {
    return buildFileDiffList(
      toFileMeta(leftVersionQuery.data?.version?.files),
      toFileMeta(rightVersionQuery.data?.version?.files),
    )
  }, [leftVersionQuery.data?.version?.files, rightVersionQuery.data?.version?.files])

  useEffect(() => {
    setSelectedPath(selectDefaultFilePath(diffItems))
  }, [diffItems])

  useEffect(() => {
    setLeftContent(null)
    setRightContent(null)
    setFileError(null)
    if (!selectedPath) return

    const leftFile = leftVersionQuery.data?.version?.files?.find((file) => file.path === selectedPath)
    const rightFile = rightVersionQuery.data?.version?.files?.find((file) => file.path === selectedPath)
    if (!leftFile && !rightFile) return

    let cancelled = false
    setIsLoadingFile(true)

    Promise.all([
      leftFile
        ? getSkillFileText({
            slug: skill.slug,
            path: selectedPath,
            version: leftVersion,
            sha256: leftFile.sha256,
          }).then((result) => result.text)
        : Promise.resolve(null),
      rightFile
        ? getSkillFileText({
            slug: skill.slug,
            path: selectedPath,
            version: rightVersion,
            sha256: rightFile.sha256,
          }).then((result) => result.text)
        : Promise.resolve(null),
    ])
      .then(([left, right]) => {
        if (cancelled) return
        setLeftContent(left)
        setRightContent(right)
      })
      .catch((error) => {
        if (cancelled) return
        setFileError(error instanceof Error ? error.message : copy.failed)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFile(false)
      })

    return () => {
      cancelled = true
    }
  }, [leftVersion, leftVersionQuery.data?.version?.files, rightVersion, rightVersionQuery.data?.version?.files, selectedPath, skill.slug])

  return (
    <div className={`card ${variant === 'embedded' ? '' : 'skill-diff-card'}`}>
      <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
        {copy.title}
      </h2>
      <p className="section-subtitle" style={{ marginTop: 8 }}>
        {copy.subtitle}
      </p>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <label>
            <div style={{ marginBottom: 6 }}>{copy.leftVersion}</div>
            <select value={leftVersion ?? ''} onChange={(e) => setLeftVersion(e.target.value || null)}>
              {orderedVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ marginBottom: 6 }}>{copy.rightVersion}</div>
            <select value={rightVersion ?? ''} onChange={(e) => setRightVersion(e.target.value || null)}>
              {orderedVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 4 }}>
          <strong>{copy.availableFiles}</strong>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {diffItems.length === 0 ? (
            <div className="stat">{copy.empty}</div>
          ) : (
            diffItems.map((item) => (
              <button
                key={item.path}
                className={`file-row file-row-button${selectedPath === item.path ? ' is-active' : ''}`}
                type="button"
                onClick={() => setSelectedPath(item.path)}
              >
                <span className="file-path">{item.path}</span>
                <span className="file-meta">{item.status}</span>
              </button>
            ))
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <div className="file-viewer">
            <div className="file-viewer-header">{leftVersion ? `v${leftVersion}` : copy.leftFallback}</div>
            <div className="file-viewer-body">
              {isLoadingFile ? (
                <div className="stat">{skillsCopy.detail.tabs.loadingDiff}</div>
              ) : fileError ? (
                <div className="stat">{copy.failed}{fileError}</div>
              ) : leftContent !== null ? (
                <pre className="file-viewer-code">{leftContent}</pre>
              ) : (
                <div className="stat">{copy.noFileInVersion}</div>
              )}
            </div>
          </div>
          <div className="file-viewer">
            <div className="file-viewer-header">{rightVersion ? `v${rightVersion}` : copy.rightFallback}</div>
            <div className="file-viewer-body">
              {isLoadingFile ? (
                <div className="stat">{skillsCopy.detail.tabs.loadingDiff}</div>
              ) : fileError ? (
                <div className="stat">{copy.failed}{fileError}</div>
              ) : rightContent !== null ? (
                <pre className="file-viewer-code">{rightContent}</pre>
              ) : (
                <div className="stat">{copy.noFileInVersion}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
