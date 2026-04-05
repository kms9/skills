import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

interface UndeleteResponse {
  ok: string
}

export function useUndeleteSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (slug: string) =>
      apiClient.post<UndeleteResponse>(`/skills/${slug}/undelete`),
    onSuccess: (data, slug) => {
      // Invalidate skills list to refetch
      queryClient.invalidateQueries({ queryKey: ['skills', 'list'] })

      // Invalidate specific skill detail
      queryClient.invalidateQueries({
        queryKey: ['skills', 'detail', slug],
      })

      // Invalidate search results
      queryClient.invalidateQueries({ queryKey: ['skills', 'search'] })
    },
  })
}
