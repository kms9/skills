import {
  getApiBase,
  getAuthBase as getAuthBaseValue,
  getBackendBase as getBackendBaseValue,
} from './env'

export function getBackendBase() {
  return getBackendBaseValue()
}

export function getAuthBase() {
  return getAuthBaseValue()
}

export function buildAuthNavigationUrl(path: string) {
  const authBase = getAuthBase()
  if (!authBase) return path
  const base = authBase.endsWith('/') ? authBase.slice(0, -1) : authBase
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${getApiBase()}${endpoint}`

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new ApiError(
      (error as { error?: string }).error || 'Request failed',
      response.status,
      error,
    )
  }

  const text = await response.text()
  if (!text) return {} as T

  return JSON.parse(text) as T
}

export async function authRequest<T>(endpoint: string, body: unknown): Promise<T> {
  const url = `${getBackendBase()}${endpoint}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new ApiError(
      (error as { error?: string }).error || 'Request failed',
      response.status,
      error,
    )
  }

  const text = await response.text()
  if (!text) return {} as T

  return JSON.parse(text) as T
}
