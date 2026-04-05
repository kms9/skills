/**
 * API Client for ClawHub Go Backend
 * Provides typed fetch wrapper for all API endpoints
 */

import { getApiBase } from './env'

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

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return ''
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const { params, ...fetchOptions } = options

  // Build URL with query params
  let url = `${getApiBase()}${endpoint}`
  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value))
      }
    })
    const queryString = searchParams.toString()
    if (queryString) {
      url += `?${queryString}`
    }
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      credentials: 'include',
      headers: {
        ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...fetchOptions.headers,
      },
    })

    if (!response.ok) {
      const errorData = await readResponseBody(response)

      throw new ApiError(
        `API request failed: ${response.statusText}`,
        response.status,
        errorData,
      )
    }

    return await response.json()
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      0,
    )
  }
}

export const apiClient = {
  get: <T>(endpoint: string, options?: FetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: FetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),

  // Special method for multipart form data
  postMultipart: async <T>(
    endpoint: string,
    formData: FormData,
  ): Promise<T> => {
    const url = `${getApiBase()}${endpoint}`
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })

    if (!response.ok) {
      const errorData = await readResponseBody(response)

      throw new ApiError(
        `API request failed: ${response.statusText}`,
        response.status,
        errorData,
      )
    }

    return await response.json()
  },
}
