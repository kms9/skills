import { vi } from 'vitest'

export const apiClientMocks = {
  get: vi.fn(),
  post: vi.fn(),
  postMultipart: vi.fn(),
  delete: vi.fn(),
}

export function resetApiClientMocks() {
  apiClientMocks.get.mockReset()
  apiClientMocks.post.mockReset()
  apiClientMocks.postMultipart.mockReset()
  apiClientMocks.delete.mockReset()
}

export function setupDefaultApiClientMocks() {
  apiClientMocks.get.mockResolvedValue(null)
  apiClientMocks.post.mockResolvedValue({ ok: 'ok' })
  apiClientMocks.postMultipart.mockResolvedValue({ ok: 'ok' })
  apiClientMocks.delete.mockResolvedValue({ ok: 'ok' })
}
