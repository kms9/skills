import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../lib/apiClient'
import type { SkillDetailResponse } from '../types/api'

export function useSkill(slug: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['skills', 'detail', slug],
    queryFn: () => apiRequest<SkillDetailResponse>(`/skills/${slug}`),
    enabled: options?.enabled ?? Boolean(slug),
  })
}
