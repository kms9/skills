'use node'

import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import type { ActionCtx } from './_generated/server'
import { internalAction } from './_generated/server'
import {
  backupSkillToGitHub,
  deleteGitHubSkillBackup,
  fetchGitHubSkillMeta,
  getGitHubBackupContext,
  isGitHubBackupConfigured,
  listGitHubSkillBackupEntries,
  normalizeOwner,
} from './lib/githubBackup'

const DEFAULT_BATCH_SIZE = 50
const MAX_BATCH_SIZE = 200
const DEFAULT_MAX_BATCHES = 5
const MAX_MAX_BATCHES = 200

type BackupPageItem =
  | {
      kind: 'ok'
      slug: string
      version: string
      displayName: string
      ownerHandle: string
      files: Doc<'skillVersions'>['files']
      publishedAt: number
    }
  | { kind: 'missingLatestVersion' }
  | { kind: 'missingVersionDoc' }
  | { kind: 'missingOwner' }

export type GitHubBackupSyncStats = {
  skillsScanned: number
  skillsSkipped: number
  skillsBackedUp: number
  skillsDeleted: number
  skillsMissingVersion: number
  skillsMissingOwner: number
  errors: number
}

export type SyncGitHubBackupsInternalArgs = {
  dryRun?: boolean
  batchSize?: number
  maxBatches?: number
}

export type SyncGitHubBackupsInternalResult = {
  stats: GitHubBackupSyncStats
  cursor: string | null
  isDone: boolean
}

export const backupSkillForPublishInternal = internalAction({
  args: {
    slug: v.string(),
    version: v.string(),
    displayName: v.string(),
    ownerHandle: v.string(),
    files: v.array(
      v.object({
        path: v.string(),
        size: v.number(),
        storageId: v.id('_storage'),
        sha256: v.string(),
        contentType: v.optional(v.string()),
      }),
    ),
    publishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!isGitHubBackupConfigured()) {
      return { skipped: true as const }
    }
    await backupSkillToGitHub(ctx, args)
    return { skipped: false as const }
  },
})

export async function syncGitHubBackupsInternalHandler(
  ctx: ActionCtx,
  args: SyncGitHubBackupsInternalArgs,
): Promise<SyncGitHubBackupsInternalResult> {
  const dryRun = Boolean(args.dryRun)
  const stats: GitHubBackupSyncStats = {
    skillsScanned: 0,
    skillsSkipped: 0,
    skillsBackedUp: 0,
    skillsDeleted: 0,
    skillsMissingVersion: 0,
    skillsMissingOwner: 0,
    errors: 0,
  }

  if (!isGitHubBackupConfigured()) {
    return { stats, cursor: null, isDone: true }
  }

  const batchSize = clampInt(args.batchSize ?? DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE)
  const maxBatches = clampInt(args.maxBatches ?? DEFAULT_MAX_BATCHES, 1, MAX_MAX_BATCHES)
  const context = await getGitHubBackupContext()

  const state = dryRun
    ? { cursor: null as string | null }
    : ((await ctx.runQuery(internal.githubBackups.getGitHubBackupSyncStateInternal, {})) as {
        cursor: string | null
      })

  let cursor: string | null = state.cursor
  let isDone = false

  for (let batch = 0; batch < maxBatches; batch++) {
    const page = (await ctx.runQuery(internal.githubBackups.getGitHubBackupPageInternal, {
      cursor: cursor ?? undefined,
      batchSize,
    })) as { items: BackupPageItem[]; cursor: string | null; isDone: boolean }

    cursor = page.cursor
    isDone = page.isDone

    for (const item of page.items) {
      if (item.kind !== 'ok') {
        if (item.kind === 'missingLatestVersion' || item.kind === 'missingVersionDoc') {
          stats.skillsMissingVersion += 1
        } else if (item.kind === 'missingOwner') {
          stats.skillsMissingOwner += 1
        }
        continue
      }

      stats.skillsScanned += 1
      try {
        const meta = await fetchGitHubSkillMeta(context, item.ownerHandle, item.slug)
        if (meta?.latest?.version === item.version) {
          stats.skillsSkipped += 1
          continue
        }

        if (!dryRun) {
          await backupSkillToGitHub(
            ctx,
            {
              slug: item.slug,
              version: item.version,
              displayName: item.displayName,
              ownerHandle: item.ownerHandle,
              files: item.files,
              publishedAt: item.publishedAt,
            },
            context,
          )
          stats.skillsBackedUp += 1
        }
      } catch (error) {
        console.error('GitHub backup sync failed', error)
        stats.errors += 1
      }
    }

    if (!dryRun) {
      await ctx.runMutation(internal.githubBackups.setGitHubBackupSyncStateInternal, {
        cursor: isDone ? undefined : (cursor ?? undefined),
      })
    }

    if (isDone) break
  }

  await pruneDeletedSkillBackups(ctx, context, dryRun, stats)

  return { stats, cursor, isDone }
}

async function pruneDeletedSkillBackups(
  ctx: ActionCtx,
  context: Awaited<ReturnType<typeof getGitHubBackupContext>>,
  dryRun: boolean,
  stats: GitHubBackupSyncStats,
) {
  let entries: Awaited<ReturnType<typeof listGitHubSkillBackupEntries>>
  try {
    entries = await listGitHubSkillBackupEntries(context)
  } catch (error) {
    console.error('GitHub backup cleanup list failed', error)
    stats.errors += 1
    return
  }

  for (const entry of entries) {
    try {
      const skill = (await ctx.runQuery(internal.skills.getSkillBySlugInternal, {
        slug: entry.slug,
      })) as Doc<'skills'> | null
      if (!skill || skill.softDeletedAt) {
        await deleteBackupIfNeeded(context, entry, dryRun, stats)
        continue
      }

      const owner = (await ctx.runQuery(internal.users.getByIdInternal, {
        userId: skill.ownerUserId,
      })) as Doc<'users'> | null
      if (!owner || owner.deletedAt || owner.deactivatedAt) {
        await deleteBackupIfNeeded(context, entry, dryRun, stats)
        continue
      }

      const ownerHandle = normalizeOwner(owner.handle ?? owner._id)
      if (ownerHandle !== entry.owner) {
        await deleteBackupIfNeeded(context, entry, dryRun, stats)
      }
    } catch (error) {
      console.error('GitHub backup cleanup failed', error)
      stats.errors += 1
    }
  }
}

async function deleteBackupIfNeeded(
  context: Awaited<ReturnType<typeof getGitHubBackupContext>>,
  entry: Awaited<ReturnType<typeof listGitHubSkillBackupEntries>>[number],
  dryRun: boolean,
  stats: GitHubBackupSyncStats,
) {
  const result = dryRun
    ? { deleted: true as const }
    : await deleteGitHubSkillBackup(context, entry.owner, entry.slug)
  if (result.deleted) {
    stats.skillsDeleted += 1
  }
}

export const syncGitHubBackupsInternal = internalAction({
  args: {
    dryRun: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
    maxBatches: v.optional(v.number()),
  },
  handler: syncGitHubBackupsInternalHandler,
})

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)))
}
