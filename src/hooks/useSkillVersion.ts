import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../lib/apiClient'
import type { SkillVersionResponse } from '../types/api'

export function useSkillVersion(
  slug: string,
  version: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['skills', 'version', slug, version],
    queryFn: () => apiRequest<SkillVersionResponse>(`/skills/${slug}/versions/${version}`),
    enabled: (options?.enabled ?? true) && Boolean(slug && version),
  })
}
