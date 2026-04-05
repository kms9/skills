import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import { buildTrendingLeaderboard } from './lib/leaderboards'

const MAX_TRENDING_LIMIT = 200
const KEEP_LEADERBOARD_ENTRIES = 3

export const rebuildTrendingLeaderboardInternal = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = clampInt(args.limit ?? MAX_TRENDING_LIMIT, 1, MAX_TRENDING_LIMIT)
    const now = Date.now()
    const { startDay, endDay, items } = await buildTrendingLeaderboard(ctx, { limit, now })

    await ctx.db.insert('skillLeaderboards', {
      kind: 'trending',
      generatedAt: now,
      rangeStartDay: startDay,
      rangeEndDay: endDay,
      items,
    })

    const recent = await ctx.db
      .query('skillLeaderboards')
      .withIndex('by_kind', (q) => q.eq('kind', 'trending'))
      .order('desc')
      .take(KEEP_LEADERBOARD_ENTRIES + 5)

    for (const entry of recent.slice(KEEP_LEADERBOARD_ENTRIES)) {
      await ctx.db.delete(entry._id)
    }

    return { ok: true as const, count: items.length }
  },
})

function clampInt(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
