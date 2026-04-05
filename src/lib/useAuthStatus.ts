import { useQuery } from '@tanstack/react-query'
import { apiRequest } from './apiClient'

type Me = {
  id: string
  handle: string
  displayName: string
  name?: string
  email?: string
  pendingEmail?: string | null
  image?: string | null
  avatarUrl?: string | null
  bio?: string | null
  role?: string | null
  status?: string | null
  authProvider?: string | null
  hasBoundEmail?: boolean
  emailVerifiedAt?: string | null
  isSuperuser?: boolean
  hasManagementAccess?: boolean
  feishuBinding?: {
    bound: boolean
    openId?: string | null
    unionId?: string | null
    tenantKey?: string | null
    displayName?: string | null
    email?: string | null
  } | null
  _id?: string
}

async function fetchMe(): Promise<Me | null> {
  try {
    return await apiRequest<Me>('/users/me')
  } catch {
    return null
  }
}

export function useAuthStatus() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    staleTime: Infinity,
    retry: false,
  })

  const user = me
    ? {
        ...me,
        _id: me.id,
        name: me.displayName,
        image: me.avatarUrl ?? me.image ?? null,
      }
    : null

  return {
    me: user,
    isLoading,
    isAuthenticated: !!user,
  }
}
