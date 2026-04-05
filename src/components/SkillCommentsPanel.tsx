import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { skillsCopy } from '../copy/skills'
import { apiRequest } from '../lib/apiClient'

type SkillCommentsPanelProps = {
  skillSlug: string
  isAuthenticated: boolean
  me: {
    id?: string
    handle?: string
    displayName?: string
    image?: string | null
  } | null
}

type SkillCommentItem = {
  id: string
  body: string
  createdAt: number
  user: {
    id: string
    handle: string
    displayName: string
    image?: string | null
  }
}

export function SkillCommentsPanel({ skillSlug, isAuthenticated, me }: SkillCommentsPanelProps) {
  const copy = skillsCopy.detail.comments
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['skills', 'comments', skillSlug],
    queryFn: () => apiRequest<{ items: SkillCommentItem[] }>(`/skills/${skillSlug}/comments`),
  })

  const createComment = useMutation({
    mutationFn: async (nextBody: string) =>
      apiRequest<SkillCommentItem>(`/skills/${skillSlug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: nextBody }),
      }),
    onSuccess: () => {
      setBody('')
      setSubmitError(null)
      void queryClient.invalidateQueries({ queryKey: ['skills', 'comments', skillSlug] })
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : copy.submit)
    },
  })

  return (
    <div className="card">
      <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>
        {copy.title}
      </h2>
      <p className="section-subtitle">{copy.subtitle}</p>

      {isAuthenticated ? (
        <form
          className="comment-form"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = body.trim()
            if (!trimmed) {
              setSubmitError(copy.bodyRequired)
              return
            }
            createComment.mutate(trimmed)
          }}
        >
          <textarea
            className="comment-input"
            placeholder={copy.placeholder}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
          />
          <div className="comment-actions">
            <button className="btn comment-submit" type="submit" disabled={createComment.isPending}>
              {createComment.isPending ? copy.posting : copy.submit}
            </button>
            {submitError ? <div className="stat">{submitError}</div> : null}
          </div>
        </form>
      ) : (
        <p className="section-subtitle">{copy.signInHint}</p>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {isLoading ? (
          <div className="stat">{copy.loading}</div>
        ) : !data?.items?.length ? (
          <div className="stat">{copy.empty}</div>
        ) : (
          data.items.map((comment) => (
            <div key={comment.id} className="comment-item">
              <div className="comment-body">
                <strong>{comment.user.displayName || comment.user.handle}</strong>
                <div className="comment-body-text">{comment.body}</div>
                <div className="stat">
                  {new Date(comment.createdAt * 1000).toLocaleString()}
                  {me?.id && comment.user.id === me.id ? ` · ${copy.you}` : ''}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
