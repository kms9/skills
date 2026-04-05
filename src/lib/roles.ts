// Role-based permissions matching Go backend API

type User = {
  _id: string
  role?: 'user' | 'moderator' | 'admin' | null
  isSuperuser?: boolean
  hasBoundEmail?: boolean
} | null | undefined

type Skill = {
  ownerUserId: string
} | null | undefined

export function isAdmin(user: User) {
  return user?.role === 'admin' || user?.isSuperuser === true
}

export function isModerator(user: User) {
  return user?.role === 'admin' || user?.role === 'moderator' || user?.isSuperuser === true
}

export function canManageSkill(user: User, skill: Skill) {
  if (!user || !skill) return false
  return user._id === skill.ownerUserId || isModerator(user)
}
