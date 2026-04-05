import { useNavigate } from '@tanstack/react-router'
import type { ClawdisSkillMetadata } from 'clawhub-schema'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSkill } from '../hooks/useSkill'
import { useSkillVersions } from '../hooks/useSkillVersions'
import { useDeleteSkill } from '../hooks/useDeleteSkill'
import { useUndeleteSkill } from '../hooks/useUndeleteSkill'
import { skillsCopy } from '../copy/skills'
import type { PublicSkill, PublicUser } from '../lib/publicUser'
import { mapOwnerInfoToPublicUser, mapSkillItemToPublicSkill } from '../lib/apiSkills'
import { canManageSkill, isModerator } from '../lib/roles'
import { useAuthStatus } from '../lib/useAuthStatus'
import { apiRequest } from '../lib/apiClient'
import { getSkillFileText } from '../lib/skillFiles'
import { SkillCommentsPanel } from './SkillCommentsPanel'
import { SkillDetailTabs } from './SkillDetailTabs'
import { SkillHeader, type SkillModerationInfo } from './SkillHeader'
import { SkillReportDialog } from './SkillReportDialog'
import {
  buildSkillHref,
  formatConfigSnippet,
  formatNixInstallSnippet,
  formatOsList,
  stripFrontmatter,
} from '../lib/badges'

type SkillDetailPageProps = {
  slug: string
  canonicalOwner?: string
  redirectToCanonical?: boolean
}

type SkillBySlugResult = {
  skill: PublicSkill
  latestVersion: {
    version: string
    createdAt: number
    changelog: string
    files?: Array<{
      path: string
      size: number
      storageKey: string
      sha256: string
      contentType?: string
    }> | null
    parsed?: unknown
  } | null
  owner: PublicUser | null
  pendingReview?: boolean
  moderationInfo?: SkillModerationInfo | null
  forkOf?: {
    kind: 'fork' | 'duplicate'
    version: string | null
    skill: { slug: string; displayName: string }
    owner: { handle: string | null; userId: string | null }
  } | null
  canonical?: {
    skill: { slug: string; displayName: string }
    owner: { handle: string | null; userId: string | null }
  } | null
} | null

type SkillFile = {
  path: string
  size: number
  storageKey: string
  sha256: string
  contentType?: string
}

export function SkillDetailPage({
  slug,
  canonicalOwner,
  redirectToCanonical,
}: SkillDetailPageProps) {
  const copy = skillsCopy.detail
  const navigate = useNavigate()
  const { isAuthenticated, me } = useAuthStatus()

  const isStaff = isModerator(me)

  // Use new API hooks instead of Convex
  const { data: result, isLoading: isLoadingSkill } = useSkill(slug)
  const deleteSkillMutation = useDeleteSkill()
  const undeleteSkillMutation = useUndeleteSkill()

  const [readme, setReadme] = useState<string | null>(null)
  const [readmeError, setReadmeError] = useState<string | null>(null)
  const [tagName, setTagName] = useState('latest')
  const [tagVersionId, setTagVersionId] = useState<string | ''>('')
  const [activeTab, setActiveTab] = useState<'files' | 'compare' | 'versions'>('files')
  const [shouldPrefetchCompare, setShouldPrefetchCompare] = useState(false)
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportError, setReportError] = useState<string | null>(null)
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)

  const skill = result?.skill ? mapSkillItemToPublicSkill(result.skill) : null
  const owner = mapOwnerInfoToPublicUser(result?.owner)
  const latestVersion = result?.latestVersion
  const shouldLoadVersionData = Boolean(
    skill && (activeTab === 'versions' || activeTab === 'compare' || shouldPrefetchCompare),
  )
  const { data: versions, isLoading: isLoadingVersions } = useSkillVersions(slug, {
    enabled: shouldLoadVersionData,
  })

  const diffVersions = versions

  // Star state from API response
  const queryClient = useQueryClient()
  const isStarred = (result as any)?.isStarred ?? false

  const starMutation = useMutation({
    mutationFn: (starred: boolean) =>
      apiRequest(`/skills/${slug}/star`, { method: starred ? 'DELETE' : 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills', 'detail', slug] })
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'stars'] })
    },
  })

  const canManage = canManageSkill(me, skill)

  const ownerHandle = owner?.handle ?? owner?.name ?? null
  const ownerParam = ownerHandle ?? (owner?._id ? String(owner._id) : null)
  const wantsCanonicalRedirect = Boolean(
    ownerParam &&
      (redirectToCanonical ||
        (typeof canonicalOwner === 'string' && canonicalOwner && canonicalOwner !== ownerParam)),
  )

  const forkOf = result?.forkOf ?? null
  const canonical = result?.canonical ?? null
  const modInfo = result?.moderationInfo ?? null
  const forkOfLabel = forkOf?.kind === 'duplicate' ? 'duplicate of' : 'fork of'
  const forkOfOwnerHandle = forkOf?.owner?.handle ?? null
  const forkOfOwnerId = forkOf?.owner?.userId ?? null
  const canonicalOwnerHandle = canonical?.owner?.handle ?? null
  const canonicalOwnerId = canonical?.owner?.userId ?? null
  const forkOfHref = forkOf?.skill?.slug
    ? buildSkillHref(forkOfOwnerHandle, forkOfOwnerId, forkOf.skill.slug)
    : null
  const canonicalHref =
    canonical?.skill?.slug && canonical.skill.slug !== forkOf?.skill?.slug
      ? buildSkillHref(canonicalOwnerHandle, canonicalOwnerId, canonical.skill.slug)
      : null

  // Phase 1: No moderation status from backend yet
  const staffSkill = null
  const moderationStatus = undefined
  const isHidden = false
  const isRemoved = false
  const isAutoHidden = false
  const staffVisibilityTag = null
  const staffModerationNote = null

  // Convert versions to a map for quick lookup
  const versionById = new Map(
    (diffVersions ?? versions ?? []).map((version) => [version._id ?? version.version, version]),
  )

  const clawdis = (latestVersion?.parsed as { clawdis?: ClawdisSkillMetadata } | undefined)?.clawdis
  const osLabels = useMemo(() => formatOsList(clawdis?.os), [clawdis?.os])
  const nixPlugin = clawdis?.nix?.plugin
  const nixSystems = clawdis?.nix?.systems ?? []
  const nixSnippet = nixPlugin ? formatNixInstallSnippet(nixPlugin) : null
  const configRequirements = clawdis?.config
  const configExample = configRequirements?.example
    ? formatConfigSnippet(configRequirements.example)
    : null
  const cliHelp = clawdis?.cliHelp
  const hasPluginBundle = Boolean(nixSnippet || configRequirements || cliHelp)

  const readmeContent = useMemo(() => {
    if (!readme) return null
    return stripFrontmatter(readme)
  }, [readme])
  const latestFiles: SkillFile[] = latestVersion?.files ?? []

  useEffect(() => {
    if (!wantsCanonicalRedirect || !ownerParam) return
    void navigate({
      to: '/$owner/$slug',
      params: { owner: ownerParam, slug },
      replace: true,
    })
  }, [navigate, ownerParam, slug, wantsCanonicalRedirect])

  useEffect(() => {
    setReadme(null)
    setReadmeError(null)
    if (!latestVersion) return

    let cancelled = false
    void getSkillFileText({
      slug,
      path: 'SKILL.md',
      version: latestVersion.version,
      sha256: latestFiles.find((file) => file.path === 'SKILL.md')?.sha256,
    })
      .then((result) => {
        if (cancelled) return
        setReadme(result.text)
      })
      .catch((error) => {
        if (cancelled) return
        setReadmeError(error instanceof Error ? error.message : '加载 SKILL.md 失败')
      })

    return () => {
      cancelled = true
    }
  }, [latestFiles, latestVersion, slug])

  useEffect(() => {
    if (!tagVersionId && latestVersion) {
      setTagVersionId(latestVersion.version)
    }
  }, [latestVersion, tagVersionId])

  const closeReportDialog = () => {
    setIsReportDialogOpen(false)
    setReportReason('')
    setReportError(null)
    setIsSubmittingReport(false)
  }

  const openReportDialog = () => {
    setReportReason('')
    setReportError(null)
    setIsSubmittingReport(false)
    setIsReportDialogOpen(true)
  }

  const submitTag = () => {
    if (!skill) return
    if (!tagName.trim() || !tagVersionId) return
    // Phase 1: Tag update not implemented in backend
    console.log('Tag update not available in Phase 1')
  }

  const submitReport = async () => {
    if (!skill) return

    const trimmedReason = reportReason.trim()
    if (!trimmedReason) {
      setReportError(copy.reportDialog.reasonRequired)
      return
    }

    setIsSubmittingReport(true)
    setReportError(null)
    try {
      // Phase 1: Report functionality not implemented in backend
      console.log('Report functionality not available in Phase 1')
      closeReportDialog()
      window.alert(copy.reportDialog.phase2)
    } catch (error) {
      console.error('Failed to report skill', error)
      setReportError(copy.reportDialog.phase2)
      setIsSubmittingReport(false)
    }
  }

  if (isLoadingSkill || wantsCanonicalRedirect) {
    return (
      <main className="section">
        <div className="card">
          <div className="loading-indicator">{copy.loadingSkill}</div>
        </div>
      </main>
    )
  }

  if (result === null || !skill) {
    return (
      <main className="section">
        <div className="card">{copy.notFound}</div>
      </main>
    )
  }

  // Phase 1: tags is an array, not a map
  const tagEntries: Array<[string, string]> = []

  return (
    <main className="section">
      <div className="skill-detail-stack">
        <SkillHeader
          skill={skill}
          owner={owner}
          ownerHandle={ownerHandle}
          latestVersion={latestVersion}
          modInfo={modInfo}
          canManage={canManage}
          isAuthenticated={isAuthenticated}
          isStaff={isStaff}
          isStarred={isStarred}
          onToggleStar={() => {
            if (isAuthenticated) starMutation.mutate(isStarred)
          }}
          onOpenReport={openReportDialog}
          forkOf={forkOf}
          forkOfLabel={forkOfLabel}
          forkOfHref={forkOfHref}
          forkOfOwnerHandle={forkOfOwnerHandle}
          canonical={canonical}
          canonicalHref={canonicalHref}
          canonicalOwnerHandle={canonicalOwnerHandle}
          staffModerationNote={staffModerationNote}
          staffVisibilityTag={staffVisibilityTag}
          isAutoHidden={isAutoHidden}
          isRemoved={isRemoved}
          nixPlugin={nixPlugin}
          hasPluginBundle={hasPluginBundle}
          configRequirements={configRequirements}
          cliHelp={cliHelp}
          tagEntries={[]}
          versionById={versionById}
          tagName={tagName}
          onTagNameChange={setTagName}
          tagVersionId={tagVersionId}
          onTagVersionChange={setTagVersionId}
          onTagSubmit={submitTag}
          tagVersions={versions}
          clawdis={clawdis}
          osLabels={osLabels}
        />

        {nixSnippet ? (
          <div className="card">
            <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
              {copy.installViaNix}
            </h2>
            <p className="section-subtitle" style={{ margin: 0 }}>
              {nixSystems.length ? `${copy.systems}：${nixSystems.join(', ')}` : copy.defaultSystem}
            </p>
            <pre className="hero-install-code" style={{ marginTop: 12 }}>
              {nixSnippet}
            </pre>
          </div>
        ) : null}

        {configExample ? (
          <div className="card">
            <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
              {copy.configExample}
            </h2>
            <p className="section-subtitle" style={{ margin: 0 }}>
              {copy.configExampleSubtitle}
            </p>
            <pre className="hero-install-code" style={{ marginTop: 12 }}>
              {configExample}
            </pre>
          </div>
        ) : null}

        <SkillDetailTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onCompareIntent={() => setShouldPrefetchCompare(true)}
          readmeContent={readmeContent}
          readmeError={readmeError}
          latestFiles={latestFiles}
          latestVersion={latestVersion?.version ?? null}
          skill={skill}
          diffVersions={diffVersions}
          versions={versions}
          isLoadingVersions={isLoadingVersions}
        />

        <SkillCommentsPanel skillSlug={slug} isAuthenticated={isAuthenticated} me={me ?? null} />
      </div>

      <SkillReportDialog
        isOpen={isAuthenticated && isReportDialogOpen}
        isSubmitting={isSubmittingReport}
        reportReason={reportReason}
        reportError={reportError}
        onReasonChange={setReportReason}
        onCancel={closeReportDialog}
        onSubmit={() => void submitReport()}
      />
    </main>
  )
}
