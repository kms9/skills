import { useInfiniteQuery } from '@tanstack/react-query'
import { apiRequest } from '../lib/apiClient'
import type { SkillListResponse } from '../types/api'

interface UseSkillsOptions {
  sort?: string
  dir?: 'asc' | 'desc'
  limit?: number
  highlightedOnly?: boolean
  nonSuspiciousOnly?: boolean
  enabled?: boolean
}

export function useSkills(options: UseSkillsOptions = {}) {
  const {
    sort = 'downloads',
    dir = 'desc',
    limit = 25,
    highlightedOnly = false,
    nonSuspiciousOnly = false,
    enabled = true,
  } = options

  return useInfiniteQuery({
    queryKey: ['skills', 'list', { sort, dir, limit, highlightedOnly, nonSuspiciousOnly }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(limit),
      })

      // Add optional parameters
      if (pageParam) params.set('cursor', pageParam as string)
      if (sort) params.set('sort', sort)
      if (dir) params.set('dir', dir)
      if (highlightedOnly) params.set('highlighted', '1')
      if (nonSuspiciousOnly) params.set('nonSuspicious', '1')

      return apiRequest<SkillListResponse>(`/skills?${params}`)
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    enabled,
  })
}
