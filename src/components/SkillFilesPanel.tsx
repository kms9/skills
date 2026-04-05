import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { skillsCopy } from '../copy/skills'
import { formatBytes } from '../lib/badges'
import { getSkillFileText } from '../lib/skillFiles'

type SkillFile = {
  path: string
  size: number
  storageId?: string
  sha256?: string
  contentType?: string
}

type SkillFilesPanelProps = {
  slug: string
  version: string | null
  readmeContent: string | null
  readmeError: string | null
  latestFiles: SkillFile[]
}

export function SkillFilesPanel({
  slug,
  version,
  readmeContent,
  readmeError,
  latestFiles,
}: SkillFilesPanelProps) {
  const copy = skillsCopy.detail.files
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileMeta, setFileMeta] = useState<{ size: number; sha256?: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fileCacheRef = useRef(new Map<string, { text: string; size: number; sha256?: string }>())
  const requestIdRef = useRef(0)

  useEffect(() => {
    fileCacheRef.current.clear()
    requestIdRef.current += 1
    setSelectedPath(null)
    setFileContent(null)
    setFileMeta(null)
    setFileError(null)
    setIsLoading(false)
  }, [slug, version])

  const handleSelect = useCallback(
    async (path: string) => {
      setSelectedPath(path)
      setFileError(null)

      const cacheKey = `${version ?? 'latest'}:${path}`
      const cached = fileCacheRef.current.get(cacheKey)
      if (cached) {
        setFileContent(cached.text)
        setFileMeta({ size: cached.size, sha256: cached.sha256 })
        setIsLoading(false)
        return
      }

      const file = latestFiles.find((f) => f.path === path)
      if (!file) {
        setFileError(copy.fileMetadataMissing)
        setFileContent(null)
        setFileMeta(null)
        return
      }

      const requestId = ++requestIdRef.current
      setIsLoading(true)
      setFileContent(null)
      setFileMeta({ size: file.size, sha256: file.sha256 })

      try {
        const result = await getSkillFileText({
          slug,
          path,
          version,
          sha256: file.sha256,
        })
        fileCacheRef.current.set(cacheKey, result)
        if (requestId !== requestIdRef.current) return
        setFileContent(result.text)
        setFileMeta({ size: result.size, sha256: result.sha256 })
      } catch (error) {
        if (requestId !== requestIdRef.current) return
        setFileError(error instanceof Error ? error.message : copy.loadFileFailed)
        setFileContent(null)
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false)
        }
      }
    },
    [latestFiles, slug, version],
  )

  return (
    <div className="tab-body">
      <div>
        <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
          {copy.readmeTitle}
        </h2>
        <div className="markdown">
          {readmeContent ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{readmeContent}</ReactMarkdown>
          ) : readmeError ? (
            <div className="stat">{copy.readmeFailed}{readmeError}</div>
          ) : (
            <div>{skillsCopy.detail.tabs.loadingFiles}</div>
          )}
        </div>
      </div>
      <div className="file-browser">
        <div className="file-list">
          <div className="file-list-header">
            <h3 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>
              {skillsCopy.detail.tabs.files}
            </h3>
            <span className="section-subtitle" style={{ margin: 0 }}>
              {latestFiles.length} {copy.totalFiles}
            </span>
          </div>
          <div className="file-list-body">
            {latestFiles.length === 0 ? (
              <div className="stat">{copy.noFiles}</div>
            ) : (
              latestFiles.map((file) => (
                <button
                  key={file.path}
                  className={`file-row file-row-button${
                    selectedPath === file.path ? ' is-active' : ''
                  }`}
                  type="button"
                  onClick={() => handleSelect(file.path)}
                  aria-current={selectedPath === file.path ? 'true' : undefined}
                >
                  <span className="file-path">{file.path}</span>
                  <span className="file-meta">{formatBytes(file.size)}</span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="file-viewer">
          <div className="file-viewer-header">
            <div className="file-path">{selectedPath ?? copy.selectFile}</div>
            {fileMeta ? (
              <span className="file-meta">
                {formatBytes(fileMeta.size)}
                {fileMeta.sha256 ? ` · ${fileMeta.sha256.slice(0, 12)}…` : ''}
              </span>
            ) : null}
          </div>
          <div className="file-viewer-body">
            {isLoading ? (
              <div className="stat">{skillsCopy.detail.tabs.loadingFiles}</div>
            ) : fileError ? (
              <div className="stat">{copy.loadFileFailedWithReason}{fileError}</div>
            ) : fileContent ? (
              <pre className="file-viewer-code">{fileContent}</pre>
            ) : (
              <div className="stat">{copy.selectPrompt}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
