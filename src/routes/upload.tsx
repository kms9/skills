import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import semver from 'semver'
import { uploadCopy } from '../copy/upload'
import { usePublishSkill } from '../hooks/usePublishSkill'
import { ApiError, apiRequest } from '../lib/apiClient'
import {
  deriveDisplayNameFromName,
  deriveSlugFromName,
  findPrimarySkillFileIndex,
  getFrontmatterString,
  parseFrontmatter,
} from '../lib/skillFrontmatter'
import { getSiteMode } from '../lib/site'
import { expandDroppedItems, expandFilesWithReport } from '../lib/uploadFiles'
import { useAuthStatus } from '../lib/useAuthStatus'
import type { SkillDetailResponse, VersionListResponse } from '../types/api'
import {
  formatBytes,
  formatPublishError,
  isTextFile,
  readText,
} from './upload/-utils'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type SlugIntentState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'owned'; latestVersion: string | null }
  | { kind: 'taken' }
  | { kind: 'error' }

export const Route = createFileRoute('/upload')({
  validateSearch: (search) => ({
    updateSlug: typeof search.updateSlug === 'string' ? search.updateSlug : undefined,
  }),
  component: Upload,
})

export function Upload() {
  const copy = uploadCopy
  const { isAuthenticated, me } = useAuthStatus()
  const { updateSlug } = useSearch({ from: '/upload' })
  const siteMode = getSiteMode()
  const isSoulMode = siteMode === 'souls'
  const requiredFileLabel = isSoulMode ? 'SOUL.md' : 'SKILL.md'
  const contentLabel = isSoulMode ? copy.nouns.soul : copy.nouns.skill

  // Use new publish skill hook
  const publishSkill = usePublishSkill()

  const [hasAttempted, setHasAttempted] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [ignoredMacJunkPaths, setIgnoredMacJunkPaths] = useState<string[]>([])
  const [slug, setSlug] = useState(updateSlug ?? '')
  const [displayName, setDisplayName] = useState('')
  const [slugTouched, setSlugTouched] = useState(Boolean(updateSlug?.trim()))
  const [displayNameTouched, setDisplayNameTouched] = useState(false)
  const [version, setVersion] = useState('1.0.0')
  const [tags, setTags] = useState('latest')
  const [changelog, setChangelog] = useState('')
  const [changelogSource, setChangelogSource] = useState<'auto' | 'user' | null>(null)
  const changelogTouchedRef = useRef(false)
  const [status, setStatus] = useState<string | null>(null)
  const isSubmitting = status !== null
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [slugIntent, setSlugIntent] = useState<SlugIntentState>({ kind: 'idle' })
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const slugCheckIdRef = useRef(0)
  const validationRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const maxBytes = 50 * 1024 * 1024
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files])
  const stripRoot = useMemo(() => {
    if (files.length === 0) return null
    const paths = files.map((file) => (file.webkitRelativePath || file.name).replace(/^\.\//, ''))
    if (!paths.every((path) => path.includes('/'))) return null
    const firstSegment = paths[0]?.split('/')[0]
    if (!firstSegment) return null
    if (!paths.every((path) => path.startsWith(`${firstSegment}/`))) return null
    return firstSegment
  }, [files])
  const normalizedPaths = useMemo(
    () =>
      files.map((file) => {
        const raw = (file.webkitRelativePath || file.name).replace(/^\.\//, '')
        if (stripRoot && raw.startsWith(`${stripRoot}/`)) {
          return raw.slice(stripRoot.length + 1)
        }
        return raw
      }),
    [files, stripRoot],
  )
  const hasRequiredFile = useMemo(
    () =>
      normalizedPaths.some((path) => {
        const lower = path.trim().toLowerCase()
        return isSoulMode ? lower === 'soul.md' : lower === 'skill.md' || lower === 'skills.md'
      }),
    [isSoulMode, normalizedPaths],
  )
  const sizeLabel = totalBytes ? formatBytes(totalBytes) : '0 B'
  const ignoredMacJunkNote = useMemo(() => {
    if (ignoredMacJunkPaths.length === 0) return null
    const labels = Array.from(
      new Set(ignoredMacJunkPaths.map((path) => path.split('/').at(-1) ?? path)),
    ).slice(0, 3)
    const suffix = ignoredMacJunkPaths.length > 3 ? ', ...' : ''
    const count = ignoredMacJunkPaths.length
    return copy.dropzone.ignoredMacJunk
      .replace('{count}', String(count))
      .replace('{labels}', labels.join(', '))
      .replace('{suffix}', suffix)
  }, [ignoredMacJunkPaths])
  const [autofillNote, setAutofillNote] = useState<string | null>(null)
  const trimmedSlug = slug.trim()
  const trimmedName = displayName.trim()
  const trimmedChangelog = changelog.trim()
  const currentUserHandle = me?.handle?.trim() ?? ''
  const latestOwnedVersion = slugIntent.kind === 'owned' ? slugIntent.latestVersion : null

  // Phase 1: Skip auto-changelog generation (backend API not available yet)
  // Removed: useEffect for existing skill lookup and changelog auto-generation

  const parsedTags = useMemo(
    () =>
      tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tags],
  )
  const validation = useMemo(() => {
    const issues: string[] = []
    if (!trimmedSlug) {
      issues.push(copy.validation.slugRequired)
    } else if (!SLUG_PATTERN.test(trimmedSlug)) {
      issues.push(copy.validation.slugFormat)
    } else if (slugIntent.kind === 'taken') {
      issues.push(copy.validation.slugTaken)
    }
    if (!trimmedName) {
      issues.push(copy.validation.displayNameRequired)
    }
    if (!semver.valid(version)) {
      issues.push(copy.validation.versionInvalid)
    } else if (
      latestOwnedVersion &&
      semver.valid(latestOwnedVersion) &&
      !semver.gt(version, latestOwnedVersion)
    ) {
      issues.push(copy.validation.versionMustIncrease.replace('{version}', latestOwnedVersion))
    }
    if (parsedTags.length === 0) {
      issues.push(copy.validation.tagsRequired)
    }
    if (files.length === 0) {
      issues.push(copy.validation.filesRequired)
    }
    if (!hasRequiredFile) {
      issues.push(copy.validation.requiredFile.replace('{requiredFile}', requiredFileLabel))
    }
    const invalidFiles = files.filter((file) => !isTextFile(file))
    if (invalidFiles.length > 0) {
      issues.push(copy.validation.removeNonText.replace('{names}', invalidFiles
        .slice(0, 3)
        .map((file) => file.name)
        .join(', ')))
    }
    if (totalBytes > maxBytes) {
      issues.push(copy.validation.sizeExceeded)
    }
    return {
      issues,
      ready: issues.length === 0,
    }
  }, [
    trimmedSlug,
    trimmedName,
    version,
    parsedTags.length,
    files,
    hasRequiredFile,
    totalBytes,
    requiredFileLabel,
    slugIntent.kind,
    latestOwnedVersion,
  ])

  useEffect(() => {
    if (!trimmedSlug || !SLUG_PATTERN.test(trimmedSlug)) {
      slugCheckIdRef.current += 1
      setSlugIntent({ kind: 'idle' })
      return
    }

    const requestId = slugCheckIdRef.current + 1
    slugCheckIdRef.current = requestId
    setSlugIntent({ kind: 'checking' })

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const detail = await apiRequest<SkillDetailResponse>(`/skills/${encodeURIComponent(trimmedSlug)}`)
          if (slugCheckIdRef.current !== requestId) return

          const ownerHandle = detail.owner?.handle?.trim() ?? ''
          if (!currentUserHandle || ownerHandle !== currentUserHandle) {
            setSlugIntent({ kind: 'taken' })
            return
          }

          let latestVersion = detail.latestVersion?.version ?? null
          if (!latestVersion) {
            try {
              const versions = await apiRequest<VersionListResponse>(`/skills/${encodeURIComponent(trimmedSlug)}/versions`)
              if (slugCheckIdRef.current !== requestId) return
              latestVersion = versions.items[0]?.version ?? null
            } catch {
              if (slugCheckIdRef.current !== requestId) return
            }
          }

          setSlugIntent({ kind: 'owned', latestVersion })
        } catch (fetchError) {
          if (slugCheckIdRef.current !== requestId) return
          if (fetchError instanceof ApiError && fetchError.status === 404) {
            setSlugIntent({ kind: 'available' })
            return
          }
          setSlugIntent({ kind: 'error' })
        }
      })()
    }, 250)

    return () => {
      window.clearTimeout(timer)
    }
  }, [currentUserHandle, trimmedSlug])

  useEffect(() => {
    if (!fileInputRef.current) return
    fileInputRef.current.setAttribute('webkitdirectory', '')
    fileInputRef.current.setAttribute('directory', '')
  }, [])

  if (!isAuthenticated) {
    return (
      <main className="section">
        <div className="card">{copy.authRequired.replace('{type}', contentLabel)}</div>
      </main>
    )
  }

  async function applyExpandedFiles(selected: File[]) {
    const report = await expandFilesWithReport(selected)
    setFiles(report.files)
    setIgnoredMacJunkPaths(report.ignoredMacJunkPaths)
    setAutofillNote(null)

    const nextPaths = report.files.map((file) => {
      const raw = (file.webkitRelativePath || file.name).replace(/^\.\//, '')
      return raw
    })
    const nextStripRoot = (() => {
      if (report.files.length === 0) return null
      if (!nextPaths.every((path) => path.includes('/'))) return null
      const firstSegment = nextPaths[0]?.split('/')[0]
      if (!firstSegment) return null
      if (!nextPaths.every((path) => path.startsWith(`${firstSegment}/`))) return null
      return firstSegment
    })()
    const nextNormalizedPaths = nextPaths.map((raw) => {
      if (nextStripRoot && raw.startsWith(`${nextStripRoot}/`)) {
        return raw.slice(nextStripRoot.length + 1)
      }
      return raw
    })
    const primaryIndex = findPrimarySkillFileIndex(nextNormalizedPaths)
    const primaryFile = primaryIndex >= 0 ? report.files[primaryIndex] : null
    if (!primaryFile) return

    try {
      const content = await readText(primaryFile)
      const parsed = parseFrontmatter(content)
      const parsedName = getFrontmatterString(parsed, 'name')
      if (!parsedName) return

      let didAutofill = false
      if (!slugTouched && !slug.trim()) {
        setSlug(deriveSlugFromName(parsedName))
        didAutofill = true
      }
      if (!displayNameTouched && !displayName.trim()) {
        setDisplayName(deriveDisplayNameFromName(parsedName))
        didAutofill = true
      }
      if (didAutofill) {
        setAutofillNote(copy.status.autofilledFromSkill.replace('{requiredFile}', requiredFileLabel))
      }
    } catch {
      // Ignore read/parse failures and leave manual entry path available.
    }
  }

  function handleRemoveFile(index: number) {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const slugStatusNote = (() => {
    switch (slugIntent.kind) {
      case 'checking':
        return <div className="stat">{copy.status.checkingSlug}</div>
      case 'available':
        return <div className="stat">{copy.status.slugAvailable}</div>
      case 'owned':
        return <div className="stat">{copy.status.slugOwned}</div>
      case 'taken':
        return <div className="error">{copy.validation.slugTaken}</div>
      case 'error':
        return <div className="stat">{copy.status.slugCheckFailed}</div>
      default:
        return null
    }
  })()

  const submitDisabled = !validation.ready || isSubmitting || slugIntent.kind === 'checking'
  const submitLabel =
    slugIntent.kind === 'owned'
      ? copy.actions.publishVersion
      : copy.actions.publish.replace('{type}', contentLabel)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setHasAttempted(true)
    if (!validation.ready) {
      if (validationRef.current && 'scrollIntoView' in validationRef.current) {
        validationRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }
    setError(null)
    if (totalBytes > maxBytes) {
      setError(copy.validation.perVersionSizeExceeded)
      return
    }
    if (!hasRequiredFile) {
      setError(copy.validation.requiredFile.replace('{requiredFile}', requiredFileLabel))
      return
    }
    setStatus(copy.status.uploading)

    // Phase 1: Use new publish skill hook with simplified flow
    // Files are uploaded directly via the new API
    setStatus(copy.status.publishing)

    publishSkill.mutate(
      {
        payload: {
          slug: trimmedSlug,
          displayName: trimmedName,
          version,
          changelog: trimmedChangelog,
          tags: parsedTags,
        },
        files,
      },
      {
        onSuccess: () => {
          setStatus(null)
          setError(null)
          setHasAttempted(false)
          setChangelogSource('user')
          const ownerParam = me?.handle ?? 'unknown'
          void navigate({
            to: isSoulMode ? '/souls/$slug' : '/$owner/$slug',
            params: isSoulMode ? { slug: trimmedSlug } : { owner: ownerParam, slug: trimmedSlug },
          })
        },
        onError: (publishError) => {
          setStatus(null)
          setError(formatPublishError(publishError))
        },
      },
    )
  }

  return (
    <main className="section upload-page">
      <header className="upload-page-header">
        <div>
          <h1 className="upload-page-title">{copy.title.replace('{type}', contentLabel)}</h1>
          <p className="upload-page-subtitle">
            {copy.subtitle.replace('{type}', contentLabel).replace('{requiredFile}', requiredFileLabel)}
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="upload-grid">
        <div className="card upload-panel">
          <label className="form-label" htmlFor="slug">
            {copy.fields.slug}
          </label>
          <input
            className="form-input"
            id="slug"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true)
              setSlug(event.target.value)
            }}
            placeholder={copy.placeholders.slug.replace('{type}', contentLabel)}
          />
          {slugStatusNote}

          <label className="form-label" htmlFor="displayName">
            {copy.fields.displayName}
          </label>
          <input
            className="form-input"
            id="displayName"
            value={displayName}
            onChange={(event) => {
              setDisplayNameTouched(true)
              setDisplayName(event.target.value)
            }}
            placeholder={copy.placeholders.displayName.replace('{type}', contentLabel)}
          />
          {autofillNote ? <div className="stat">{autofillNote}</div> : null}

          <label className="form-label" htmlFor="version">
            {copy.fields.version}
          </label>
          <input
            className="form-input"
            id="version"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            placeholder="1.0.0"
          />
          {slugIntent.kind === 'owned' && latestOwnedVersion ? (
            <div className="stat">{copy.status.latestVersion.replace('{version}', latestOwnedVersion)}</div>
          ) : null}

          <label className="form-label" htmlFor="tags">
            {copy.fields.tags}
          </label>
          <input
            className="form-input"
            id="tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="latest, stable"
          />
        </div>

        <div className="card upload-panel">
          <label
            className={`upload-dropzone${isDragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              const items = event.dataTransfer.items
              void (async () => {
                const dropped = items?.length
                  ? await expandDroppedItems(items)
                  : Array.from(event.dataTransfer.files)
                await applyExpandedFiles(dropped)
              })()
            }}
          >
            <input
              ref={fileInputRef}
              className="upload-file-input"
              id="upload-files"
              data-testid="upload-input"
              type="file"
              multiple
              // @ts-expect-error - non-standard attribute to allow folder selection
              webkitdirectory=""
              directory=""
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? [])
                void applyExpandedFiles(picked)
              }}
            />
            <div className="upload-dropzone-copy">
              <div className="upload-dropzone-title-row">
                <strong>{copy.dropzone.title}</strong>
                <span className="upload-dropzone-count">
                  {files.length} 个文件 · {sizeLabel}
                </span>
              </div>
              <span className="upload-dropzone-hint">
                {copy.dropzone.hint}
              </span>
              <button
                className="btn upload-picker-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                {copy.dropzone.chooseFolder}
              </button>
            </div>
          </label>

          <div className="upload-file-list">
            {files.length === 0 ? (
              <div className="stat">{copy.dropzone.noFiles}</div>
            ) : (
              normalizedPaths.map((path, index) => (
                <div key={path} className="upload-file-row">
                  <span>{path}</span>
                  <button
                    className="upload-remove"
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                  >
                    {copy.actions.removeFile}
                  </button>
                </div>
              ))
            )}
          </div>
          {ignoredMacJunkNote ? <div className="stat">{ignoredMacJunkNote}</div> : null}
        </div>

        <div className="card upload-panel" ref={validationRef}>
          <h2 className="upload-panel-title">{copy.validation.title}</h2>
          {validation.issues.length === 0 ? (
            <div className="stat">{copy.validation.allPassed}</div>
          ) : (
            <ul className="validation-list">
              {validation.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="card upload-panel">
          <label className="form-label" htmlFor="changelog">
            {copy.fields.changelog}
          </label>
          <textarea
            className="form-input"
            id="changelog"
            rows={6}
            value={changelog}
            onChange={(event) => {
              changelogTouchedRef.current = true
              setChangelogSource('user')
              setChangelog(event.target.value)
            }}
            placeholder={copy.placeholders.changelog.replace('{type}', contentLabel)}
          />
          {changelogSource === 'user' && changelog ? (
            <div className="stat">{copy.status.changelogReady}</div>
          ) : null}
        </div>

        <div className="upload-submit-row">
          <div className="upload-submit-notes">
            {error ? (
              <div className="error" role="alert">
                {error}
              </div>
            ) : null}
            {status ? <div className="stat">{status}</div> : null}
            {hasAttempted && !validation.ready ? (
              <div className="stat">{copy.validation.fixIssues}</div>
            ) : null}
          </div>
          <button
            className="btn btn-primary upload-submit-btn"
            type="submit"
            disabled={submitDisabled}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </main>
  )
}
