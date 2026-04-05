import { vi } from 'vitest'

export const apiRequestMock = vi.fn()

export function resetApiRequestMock() {
  apiRequestMock.mockReset()
}

export function setupDefaultApiRequestMock() {
  apiRequestMock.mockResolvedValue({ items: [], nextCursor: null })
}
