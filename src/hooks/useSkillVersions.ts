import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../lib/apiClient'
import type { VersionInfo, VersionListResponse } from '../types/api'

export function useSkillVersions(slug: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['skills', 'versions', slug],
    queryFn: async (): Promise<VersionInfo[]> => {
      const response = await apiRequest<VersionListResponse>(`/skills/${slug}/versions`)
      return response.items
    },
    enabled: options?.enabled ?? Boolean(slug),
  })
}
