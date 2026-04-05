import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

interface PublishPayload {
  slug: string
  displayName: string
  version: string
  changelog: string
  tags?: string[]
  source?: Record<string, unknown>
  forkOf?: {
    slug: string
    version?: string
  }
}

interface PublishResponse {
  ok: string
  skillId: string
  versionId: string
}

interface PublishSkillInput {
  payload: PublishPayload
  files: File[]
}

export function usePublishSkill() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ payload, files }: PublishSkillInput) => {
      const formData = new FormData()

      // Add payload as JSON
      formData.append('payload', JSON.stringify(payload))

      // Add files
      files.forEach((file) => {
        formData.append('files', file, file.name)
      })

      return apiClient.postMultipart<PublishResponse>('/skills', formData)
    },
    onSuccess: (data, variables) => {
      // Invalidate skills list to refetch
      queryClient.invalidateQueries({ queryKey: ['skills', 'list'] })

      // Invalidate specific skill detail if updating
      queryClient.invalidateQueries({
        queryKey: ['skills', 'detail', variables.payload.slug],
      })

      // Invalidate versions list
      queryClient.invalidateQueries({
        queryKey: ['skills', 'versions', variables.payload.slug],
      })

      // Invalidate search results
      queryClient.invalidateQueries({ queryKey: ['skills', 'search'] })
    },
  })
}
