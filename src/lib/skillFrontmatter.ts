import { parse as parseYaml } from 'yaml'

const FRONTMATTER_START = '---'

export type ParsedSkillFrontmatter = Record<string, unknown>

export function parseFrontmatter(content: string): ParsedSkillFrontmatter {
  const frontmatter: ParsedSkillFrontmatter = {}
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.startsWith(FRONTMATTER_START)) return frontmatter
  const endIndex = normalized.indexOf(`\n${FRONTMATTER_START}`, FRONTMATTER_START.length)
  if (endIndex === -1) return frontmatter
  const block = normalized.slice(FRONTMATTER_START.length + 1, endIndex)

  try {
    const parsed = parseYaml(block) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return frontmatter
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^[\w-]+$/.test(key)) continue
      const next = toJsonValue(value)
      if (next !== undefined) frontmatter[key] = next
    }
  } catch {
    return frontmatter
  }

  return frontmatter
}

export function getFrontmatterString(frontmatter: ParsedSkillFrontmatter, key: string) {
  const raw = frontmatter[key]
  return typeof raw === 'string' ? raw.trim() || undefined : undefined
}

export function deriveSlugFromName(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'skill'
  )
}

export function deriveDisplayNameFromName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  if (/[A-Z]/.test(trimmed) || /\s/.test(trimmed)) return trimmed
  return trimmed
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function isSkillReadmePath(path: string) {
  const normalized = path.trim().replace(/\\/g, '/').toLowerCase()
  return normalized === 'skill.md' || normalized === 'skills.md'
}

export function findPrimarySkillFileIndex(normalizedPaths: string[]) {
  const candidates = normalizedPaths
    .map((path, index) => ({ path: path.trim(), index }))
    .filter((entry) => isSkillReadmePath(entry.path))
    .sort((left, right) => left.path.localeCompare(right.path) || left.index - right.index)
  return candidates[0]?.index ?? -1
}

function toJsonValue(value: unknown): unknown {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trimEnd()
    return trimmed.trim() ? trimmed : undefined
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const next = toJsonValue(entry)
      return next === undefined ? null : next
    })
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      const next = toJsonValue(entry)
      if (next !== undefined) out[key] = next
    }
    return out
  }
  return undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
