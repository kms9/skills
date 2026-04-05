// API types matching Go backend responses

export interface Skill {
  id: string
  slug: string
  displayName: string
  description?: string
  tags: string[]
  moderationStatus: string
  latestVersionId?: string
  createdAt: string
  updatedAt: string
  latestVersion?: VersionInfo
}

export interface VersionInfo {
  version: string
  createdAt: number
  changelog: string
  files?: Array<{
    path: string
    size: number
    storageKey: string
    sha256: string
    contentType?: string
  }>
  parsed?: unknown
}

export interface SkillVersionResponse {
  version?: VersionInfo | null
  skill?: {
    slug: string
    displayName: string
  } | null
}

export interface SkillStats {
  downloads: number
  installs: number
  versions: number
  stars?: number
}

export interface SkillItem {
  slug: string
  displayName: string
  summary?: string | null
  tags: string[] | string
  stats: SkillStats
  highlighted: boolean
  createdAt: number
  updatedAt: number
  latestVersion?: VersionInfo
}

export interface SkillListResponse {
  items: SkillItem[]
  nextCursor: string | null
}

export interface SkillDetailResponse {
  skill: SkillItem
  latestVersion?: VersionInfo | null
  owner?: OwnerInfo | null
}

export interface VersionListResponse {
  items: VersionInfo[]
  nextCursor: string | null
}

export interface OwnerInfo {
  handle?: string | null
  displayName?: string | null
  image?: string | null
}

export interface ManagedOwnerInfo {
  id?: string
  handle?: string | null
  displayName?: string | null
  email?: string | null
  status?: string | null
}

export interface ManagedSkillItem extends SkillItem {
  id: string
  isDeleted: boolean
  status: 'active' | 'deleted' | string
  owner?: ManagedOwnerInfo | null
}

export interface ManagedSkillListResponse {
  items: ManagedSkillItem[]
}

export interface ManagedSkillDetailResponse {
  skill: ManagedSkillItem
  versions: VersionInfo[]
  owner?: ManagedOwnerInfo | null
  currentStatus: 'active' | 'deleted' | string
}

export interface AdminUserSummary {
  id: string
  handle: string
  displayName: string
  email: string
  avatarUrl?: string | null
  bio?: string | null
  role?: string | null
  status: string
  authProvider: string
  pendingEmail?: string | null
  hasBoundEmail?: boolean
  emailVerifiedAt?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  reviewNote?: string
  isSuperuser?: boolean
  skills?: ManagedSkillItem[]
}

export interface PublicUserProfile {
  id: string
  handle: string
  displayName: string
  email?: string | null
  avatarUrl?: string | null
  bio?: string | null
  createdAt: number
}

export interface SearchResult {
  slug: string
  displayName: string
  summary?: string | null
  version?: string | null
  score: number
  updatedAt?: number | null
}

export interface SearchResponse {
  results: SearchResult[]
}

export interface PublishPayload {
  slug: string
  displayName: string
  version: string
  changelog: string
  tags: string[]
}

export interface PublishResponse {
  ok: 'true'
  skillId: string
  versionId: string
}

export interface ResolveResponse {
  match?: { version: string } | null
  latestVersion?: { version: string } | null
}
