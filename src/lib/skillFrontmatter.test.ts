import { describe, expect, it } from 'vitest'
import {
  deriveDisplayNameFromName,
  deriveSlugFromName,
  findPrimarySkillFileIndex,
  getFrontmatterString,
  parseFrontmatter,
} from './skillFrontmatter'

describe('skillFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const frontmatter = parseFrontmatter(`---\nname: demo-skill\ndescription: Hello\n---\nBody`)
    expect(getFrontmatterString(frontmatter, 'name')).toBe('demo-skill')
    expect(getFrontmatterString(frontmatter, 'description')).toBe('Hello')
  })

  it('returns empty object for invalid frontmatter', () => {
    expect(parseFrontmatter('not-frontmatter')).toEqual({})
    expect(parseFrontmatter('---\nname: demo\nbody')).toEqual({})
  })

  it('handles missing name', () => {
    const frontmatter = parseFrontmatter(`---\ndescription: Hello\n---\nBody`)
    expect(getFrontmatterString(frontmatter, 'name')).toBeUndefined()
  })

  it('derives slug from name', () => {
    expect(deriveSlugFromName('My Demo Skill')).toBe('my-demo-skill')
    expect(deriveSlugFromName('___')).toBe('skill')
  })

  it('derives display name from slug-like names', () => {
    expect(deriveDisplayNameFromName('my-demo-skill')).toBe('My Demo Skill')
    expect(deriveDisplayNameFromName('Demo Skill')).toBe('Demo Skill')
  })

  it('finds primary skill file index', () => {
    expect(findPrimarySkillFileIndex(['notes.txt', 'SKILL.md'])).toBe(1)
    expect(findPrimarySkillFileIndex(['docs/skills.md', 'SKILL.md'])).toBe(1)
    expect(findPrimarySkillFileIndex(['notes.txt'])).toBe(-1)
  })
})
