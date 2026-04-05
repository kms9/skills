import type { OwnerInfo, SkillItem } from '../types/api'
import type { PublicSkill, PublicUser } from './publicUser'

export function mapSkillItemToPublicSkill(item: SkillItem): PublicSkill {
  return {
    _id: `skill:${item.slug}`,
    _creationTime: item.createdAt,
    slug: item.slug,
    displayName: item.displayName,
    summary: item.summary ?? null,
    ownerUserId: 'unknown',
    tags: Array.isArray(item.tags) ? item.tags : [],
    highlighted: item.highlighted ?? false,
    stats: {
      downloads: item.stats.downloads,
      installs: item.stats.installs,
      versions: item.stats.versions,
      stars: item.stats.stars ?? 0,
    },
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function mapOwnerInfoToPublicUser(owner?: OwnerInfo | null): PublicUser | null {
  if (!owner) {
    return null
  }

  const handle = owner.handle?.trim() || 'unknown'

  return {
    _id: `user:${handle}`,
    _creationTime: 0,
    handle,
    name: handle,
    displayName: owner.displayName?.trim() || handle,
    image: owner.image ?? null,
  }
}
