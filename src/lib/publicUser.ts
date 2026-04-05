// Public user and skill types matching Go backend API

export type PublicUser = {
  _id: string
  _creationTime: number
  handle: string
  name: string
  displayName: string
  image?: string | null
  bio?: string | null
}

export type PublicSkill = {
  _id: string
  _creationTime: number
  slug: string
  displayName: string
  summary?: string | null
  ownerUserId: string
  canonicalSkillId?: string | null
  forkOf?: {
    kind: 'fork' | 'duplicate'
    version: string | null
    skillId: string
  } | null
  latestVersionId?: string | null
  tags: string[]
  badges?: string[]
  highlighted?: boolean
  stats: {
    downloads: number
    installs: number
    versions: number
    stars?: number
  }
  createdAt: number
  updatedAt: number
}

export type PublicSoul = {
  _id: string
  _creationTime: number
  slug: string
  displayName: string
  summary?: string | null
  ownerUserId: string
  latestVersionId?: string | null
  tags: string[]
  stats: {
    downloads: number
    installs: number
    versions: number
  }
  createdAt: number
  updatedAt: number
}
