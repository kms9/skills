import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../lib/apiClient'
import type { SearchResponse } from '../types/api'

export function useSearchSkills(query: string, options?: { enabled?: boolean }) {
  const trimmedQuery = query.trim()

  return useQuery({
    queryKey: ['skills', 'search', trimmedQuery],
    queryFn: () => {
      const params = new URLSearchParams({ q: trimmedQuery })
      return apiRequest<SearchResponse>(`/search?${params}`)
    },
    enabled: (options?.enabled ?? true) && trimmedQuery.length > 0,
  })
}
