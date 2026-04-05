import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { importCopy } from '../copy/import'
import { usePublishSkill } from '../hooks/usePublishSkill'
import {
  buildCandidatePreview,
  type CandidatePreview,
  detectGitHubRepositoryImport,
  detectImportProvider,
  type ImportCandidate,
  type ImportProviderKind,
  type ImportRepositorySnapshot,
} from '../lib/import-providers'
import { apiClient } from '../lib/api-client'
import { useAuthStatus } from '../lib/useAuthStatus'
import { formatBytes } from '../lib/uploadUtils'

export const Route = createFileRoute('/import')({
  component: ImportRoute,
})

function providerLabel(provider: ImportProviderKind | null) {
  if (provider === 'gitlab') return importCopy.providers.gitLab
  return importCopy.providers.gitHub
}

function providerPlaceholder(provider: ImportProviderKind | null) {
  if (provider === 'gitlab') return importCopy.placeholders.gitLab
  return importCopy.placeholders.gitHub
}

function providerHint(provider: ImportProviderKind | null) {
  if (provider === 'gitlab') return importCopy.hints.gitLab
  return importCopy.hints.gitHub
}

function toErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    error.data &&
    typeof error.data === 'object' &&
    'error' in error.data &&
    typeof error.data.error === 'string'
  ) {
    return error.data.error
  }
  return error instanceof Error ? error.message : importCopy.errors.previewFailed
}

function ImportRoute() {
  const { isAuthenticated, isLoading, me } = useAuthStatus()
  const publishSkill = usePublishSkill()
  const navigate = useNavigate()

  const [url, setUrl] = useState('')
  const [repoSnapshot, setRepoSnapshot] = useState<ImportRepositorySnapshot | null>(null)
  const [candidates, setCandidates] = useState<ImportCandidate[]>([])
  const [selectedCandidatePath, setSelectedCandidatePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<CandidatePreview | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [version, setVersion] = useState('0.1.0')
  const [tags, setTags] = useState('latest')

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const guessedProvider = useMemo(() => detectImportProvider(url), [url])
  const activeProvider = preview?.resolved.kind ?? repoSnapshot?.provider ?? guessedProvider

  type GitLabPreviewResponse = {
    resolved: CandidatePreview['resolved']
    candidates: ImportCandidate[]
  }

  type GitLabCandidateResponse = CandidatePreview

  type GitLabFilesResponse = {
    files: Array<{
      path: string
      contentBase64: string
      contentType: string
    }>
  }

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected])
  const selectedBytes = useMemo(() => {
    if (!preview) return 0
    return preview.files.reduce((total, file) => {
      return selected[file.path] ? total + file.size : total
    }, 0)
  }, [preview, selected])

  const resetPreviewState = () => {
    setRepoSnapshot(null)
    setCandidates([])
    setSelectedCandidatePath(null)
    setPreview(null)
    setSelected({})
  }

  const applyPreviewState = (nextPreview: CandidatePreview) => {
    setPreview(nextPreview)
    setSlug(nextPreview.defaults.slug)
    setDisplayName(nextPreview.defaults.displayName)
    setVersion(nextPreview.defaults.version)
    setTags(nextPreview.defaults.tags.join(','))

    const nextSelected: Record<string, boolean> = {}
    for (const file of nextPreview.files) nextSelected[file.path] = file.defaultSelected
    setSelected(nextSelected)
    setStatus(importCopy.status.ready)
  }

  const loadCandidate = async (candidatePath: string, snapshotOverride?: ImportRepositorySnapshot) => {
    setError(null)
    setStatus(null)
    setPreview(null)
    setSelected({})
    setSelectedCandidatePath(candidatePath)
    setIsBusy(true)

    try {
      if ((snapshotOverride ?? repoSnapshot)?.provider === 'gitlab') {
        const nextPreview = await apiClient.post<GitLabCandidateResponse>('/import/gitlab/candidate', {
          url: url.trim(),
          candidatePath,
        })
        applyPreviewState(nextPreview)
        return
      }

      const snapshot = snapshotOverride ?? repoSnapshot
      if (!snapshot) throw new Error(importCopy.status.runDetectionAgain)
      const nextPreview = buildCandidatePreview(snapshot, candidatePath)
      applyPreviewState(nextPreview)
    } catch (e) {
      setError(toErrorMessage(e))
    } finally {
      setIsBusy(false)
    }
  }

  const detect = async () => {
    setError(null)
    setStatus(null)
    resetPreviewState()
    setIsBusy(true)

    try {
      const provider = detectImportProvider(url)
      if (provider === 'gitlab') {
        const response = await apiClient.post<GitLabPreviewResponse>('/import/gitlab/preview', {
          url: url.trim(),
        })
        const snapshot: ImportRepositorySnapshot = {
          provider: 'gitlab',
          resolved: response.resolved,
          candidates: response.candidates,
          files: [],
        }
        setRepoSnapshot(snapshot)
        setCandidates(response.candidates)

        if (response.candidates.length === 1) {
          const only = response.candidates[0]
          if (!only) throw new Error(importCopy.errors.candidateNotFound)
          await loadCandidate(only.path, snapshot)
        } else {
          setStatus(importCopy.status.foundSkills.replace('{count}', String(response.candidates.length)))
        }
        return
      }

      const snapshot = await detectGitHubRepositoryImport(url)
      setRepoSnapshot(snapshot)
      setCandidates(snapshot.candidates)

      if (snapshot.candidates.length === 1) {
        const only = snapshot.candidates[0]
        if (!only) throw new Error(importCopy.errors.candidateNotFound)
        await loadCandidate(only.path, snapshot)
      } else {
        setStatus(importCopy.status.foundSkills.replace('{count}', String(snapshot.candidates.length)))
      }
    } catch (e) {
      setError(toErrorMessage(e))
    } finally {
      setIsBusy(false)
    }
  }

  const applyDefaultSelection = () => {
    if (!preview) return
    const defaults = new Set(preview.defaults.selectedPaths)
    const nextSelected: Record<string, boolean> = {}
    for (const file of preview.files) nextSelected[file.path] = defaults.has(file.path)
    setSelected(nextSelected)
  }

  const selectAll = () => {
    if (!preview) return
    const nextSelected: Record<string, boolean> = {}
    for (const file of preview.files) nextSelected[file.path] = true
    setSelected(nextSelected)
  }

  const clearAll = () => {
    if (!preview) return
    const nextSelected: Record<string, boolean> = {}
    for (const file of preview.files) nextSelected[file.path] = false
    setSelected(nextSelected)
  }

  const doImport = async () => {
    if (!preview) return

    setIsBusy(true)
    setError(null)
    setStatus(importCopy.status.fetchingFiles.replace('{provider}', providerLabel(preview.resolved.kind)))

    try {
      const selectedFiles = preview.files.filter((file) => selected[file.path])
      if (selectedFiles.length === 0) throw new Error(importCopy.errors.noFilesSelected)

      const fileObjects: File[] = []
      if (preview.resolved.kind === 'gitlab') {
        const response = await apiClient.post<GitLabFilesResponse>('/import/gitlab/files', {
          url: url.trim(),
          commit: preview.resolved.commit,
          candidatePath: preview.candidate.path,
          selectedPaths: selectedFiles.map((file) => file.path),
        })
        for (const file of response.files) {
          setStatus(importCopy.status.downloadingFile.replace('{path}', file.path))
          const binary = atob(file.contentBase64)
          const bytes = new Uint8Array(binary.length)
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
          }
          fileObjects.push(new File([bytes], file.path, { type: file.contentType || 'text/plain' }))
        }
      } else {
        for (const file of selectedFiles) {
          setStatus(importCopy.status.downloadingFile.replace('{path}', file.path))
          const response = await fetch(file.downloadUrl)
          if (!response.ok) throw new Error(importCopy.errors.downloadFailed.replace('{path}', file.path))
          const blob = await response.blob()
          fileObjects.push(new File([blob], file.path, { type: blob.type || 'text/plain' }))
        }
      }

      setStatus(importCopy.status.publishing)
      const tagList = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      await new Promise<void>((resolve, reject) => {
        publishSkill.mutate(
          {
            payload: {
              slug: slug.trim(),
              displayName: displayName.trim(),
              version: version.trim(),
              changelog: `Imported from ${preview.resolved.repoUrl}`,
              tags: tagList,
              source: {
                kind: preview.resolved.kind,
                url: preview.resolved.repoUrl,
                repo: preview.resolved.repo,
                ref: preview.resolved.ref,
                commit: preview.resolved.commit,
                path: preview.candidate.path || '.',
                importedAt: Date.now(),
              },
            },
            files: fileObjects,
          },
          {
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          },
        )
      })

      setStatus(importCopy.status.imported)
      const ownerParam = me?.handle ?? 'unknown'
      await navigate({ to: '/$owner/$slug', params: { owner: ownerParam, slug: slug.trim() } })
    } catch (e) {
      setError(toErrorMessage(e))
      setStatus(null)
    } finally {
      setIsBusy(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <main className="section">
        <div className="card">{isLoading ? importCopy.auth.loading : importCopy.auth.required}</div>
      </main>
    )
  }

  return (
    <main className="section upload-shell">
      <div className="upload-header">
        <div>
          <div className="upload-kicker">{importCopy.header.kicker.replace('{provider}', providerLabel(activeProvider))}</div>
          <h1 className="upload-title">{importCopy.header.title}</h1>
          <p className="upload-subtitle">
            {importCopy.header.subtitle}
          </p>
        </div>
        <div className="upload-badge">
          <div>{importCopy.header.publicOnly}</div>
          <div className="upload-badge-sub">{importCopy.header.commitPinned}</div>
        </div>
      </div>

      <div className="upload-card">
        <div className="upload-fields">
          <label className="upload-field" htmlFor="import-url">
            <div className="upload-field-header">
              <strong>{importCopy.form.sourceUrl.replace('{provider}', providerLabel(guessedProvider))}</strong>
              <span className="upload-field-hint">{providerHint(guessedProvider)}</span>
            </div>
            <input
              id="import-url"
              className="upload-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={providerPlaceholder(guessedProvider)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
        </div>

        <div className="upload-footer">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!url.trim() || isBusy}
            onClick={() => void detect()}
          >
            {importCopy.form.detect}
          </button>
          {status ? <p className="upload-muted">{status}</p> : null}
        </div>

        {error ? (
          <div className="upload-validation">
            <div className="upload-validation-item upload-error">{error}</div>
          </div>
        ) : null}
      </div>

      {candidates.length > 1 ? (
        <div className="card">
          <h2 style={{ margin: 0 }}>{importCopy.form.pickSkill}</h2>
          <div className="upload-filelist">
            {candidates.map((candidate) => (
              <label key={candidate.readmePath} className="upload-file">
                <input
                  type="radio"
                  name="candidate"
                  checked={selectedCandidatePath === candidate.path}
                  onChange={() => void loadCandidate(candidate.path)}
                  disabled={isBusy}
                />
                <span className="mono">{candidate.path || importCopy.form.repoRoot}</span>
                <span>{candidate.name || candidate.description || ''}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="upload-card">
            <div className="upload-grid">
              <div className="upload-fields">
                <label className="upload-field" htmlFor="slug">
                  <div className="upload-field-header">
                    <strong>{importCopy.form.slug}</strong>
                    <span className="upload-field-hint">{importCopy.form.slugHint}</span>
                  </div>
                  <input
                    id="slug"
                    className="upload-input"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <label className="upload-field" htmlFor="name">
                  <div className="upload-field-header">
                    <strong>{importCopy.form.displayName}</strong>
                    <span className="upload-field-hint">{importCopy.form.displayNameHint}</span>
                  </div>
                  <input
                    id="name"
                    className="upload-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
                <div className="upload-row">
                  <label className="upload-field" htmlFor="version">
                    <div className="upload-field-header">
                      <strong>{importCopy.form.version}</strong>
                      <span className="upload-field-hint">{importCopy.form.versionHint}</span>
                    </div>
                    <input
                      id="version"
                      className="upload-input"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className="upload-field" htmlFor="tags">
                    <div className="upload-field-header">
                      <strong>{importCopy.form.tags}</strong>
                      <span className="upload-field-hint">{importCopy.form.tagsHint}</span>
                    </div>
                    <input
                      id="tags"
                      className="upload-input"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                </div>
              </div>
              <aside className="upload-side">
                <div className="upload-summary">
                  <div className="upload-requirement ok">{importCopy.header.commitPinned}</div>
                  <div className="upload-muted">
                    {preview.resolved.repo}@{preview.resolved.ref}
                  </div>
                  <div className="upload-muted mono">
                    {preview.resolved.commit.slice(0, 12)} · {preview.candidate.path || importCopy.form.repoRoot}
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <div className="card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <h2 style={{ margin: 0 }}>{importCopy.form.files}</h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn" type="button" disabled={isBusy} onClick={applyDefaultSelection}>
                  {importCopy.form.selectReferenced}
                </button>
                <button className="btn" type="button" disabled={isBusy} onClick={selectAll}>
                  {importCopy.form.selectAll}
                </button>
                <button className="btn" type="button" disabled={isBusy} onClick={clearAll}>
                  {importCopy.form.clear}
                </button>
              </div>
            </div>
            <div className="upload-muted">
              {importCopy.form.selectedSummary
                .replace('{selected}', String(selectedCount))
                .replace('{total}', String(preview.files.length))
                .replace('{size}', formatBytes(selectedBytes))}
            </div>
            <div className="file-list">
              {preview.files.map((file) => (
                <label key={file.path} className="file-row">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[file.path])}
                    onChange={() => setSelected((prev) => ({ ...prev, [file.path]: !prev[file.path] }))}
                    disabled={isBusy}
                  />
                  <span className="mono file-path">{file.path}</span>
                  <span className="file-meta">{formatBytes(file.size)}</span>
                </label>
              ))}
            </div>
            <div className="upload-footer">
              <button
                className="btn btn-primary"
                type="button"
                disabled={
                  isBusy || !slug.trim() || !displayName.trim() || !version.trim() || selectedCount === 0
                }
                onClick={() => void doImport()}
              >
                {importCopy.form.importAndPublish}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </main>
  )
}
