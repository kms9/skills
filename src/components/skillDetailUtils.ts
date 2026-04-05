import { skillsCopy } from '../copy/skills'

type SkillBadgeMap = Record<string, { byUserId: string; at: number }>

type SkillLike = { badges?: SkillBadgeMap | null; highlighted?: boolean | null }

type BadgeLabel = (typeof skillsCopy.badges)[keyof typeof skillsCopy.badges]

export function isSkillHighlighted(skill: SkillLike) {
  return Boolean(skill.highlighted || skill.badges?.highlighted)
}

export function isSkillOfficial(skill: SkillLike) {
  return Boolean(skill.badges?.official)
}

export function isSkillDeprecated(skill: SkillLike) {
  return Boolean(skill.badges?.deprecated)
}

export function getSkillBadges(skill: SkillLike): BadgeLabel[] {
  const badges: BadgeLabel[] = []
  if (isSkillDeprecated(skill)) badges.push(skillsCopy.badges.deprecated)
  if (isSkillOfficial(skill)) badges.push(skillsCopy.badges.official)
  if (isSkillHighlighted(skill)) badges.push(skillsCopy.badges.highlighted)
  return badges
}
