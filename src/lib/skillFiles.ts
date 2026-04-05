import { getBackendBase } from './apiClient'

export type SkillFileTextResult = {
  text: string
  size: number
  sha256?: string
}

export async function getSkillFileText(args: {
  slug: string
  path: string
  version?: string | null
  tag?: string | null
  sha256?: string
}): Promise<SkillFileTextResult> {
  const url = new URL(`${getBackendBase()}/api/v1/skills/${encodeURIComponent(args.slug)}/file`, window.location.origin)
  url.searchParams.set('path', args.path)
  if (args.version) {
    url.searchParams.set('version', args.version)
  } else if (args.tag) {
    url.searchParams.set('tag', args.tag)
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'text/plain' },
    credentials: 'include',
  })

  if (!response.ok) {
    let message = 'Request failed'
    try {
      const error = (await response.json()) as { error?: string }
      if (error.error) message = error.error
    } catch {
      const text = await response.text().catch(() => '')
      if (text) message = text
    }
    throw new Error(message)
  }

  const text = await response.text()
  return {
    text,
    size: new TextEncoder().encode(text).length,
    sha256: args.sha256,
  }
}
