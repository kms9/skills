import type { PublicSkill } from './publicUser'

type SkillPageEntry = {
  skill?: PublicSkill | null
}

function normalizeSkillStats(skill: PublicSkill): PublicSkill {
  const stats = skill.stats
  return {
    ...skill,
    stats: {
      downloads: stats?.downloads ?? 0,
      installs: stats?.installs ?? 0,
      versions: stats?.versions ?? 0,
      stars: stats?.stars ?? 0,
    },
  }
}

export function mapPublicSkillPageEntries(page: SkillPageEntry[] | undefined): PublicSkill[] {
  if (!page?.length) return []
  return page
    .map((entry) => entry.skill ?? null)
    .filter((skill): skill is PublicSkill => skill !== null)
    .map(normalizeSkillStats)
}
