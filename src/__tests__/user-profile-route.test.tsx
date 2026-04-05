/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from '../routes/u/$handle'

let paramsMock = { handle: 'ou_4a3321fb363a87913a7fc408e4945e05' }
const apiRequestMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  createFileRoute: () => (config: { component: unknown }) => ({
    options: config,
    useParams: () => paramsMock,
  }),
}))

vi.mock('../lib/apiClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}))

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('/u/$handle route', () => {
  beforeEach(() => {
    paramsMock = { handle: 'ou_4a3321fb363a87913a7fc408e4945e05' }
    apiRequestMock.mockReset()
  })

  it('prefers email over handle in public profile header', async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        id: 'u1',
        handle: 'ou_4a3321fb363a87913a7fc408e4945e05',
        displayName: 'Demo Owner',
        email: 'owner@example.com',
        avatarUrl: null,
        bio: null,
        createdAt: 1,
      })
      .mockResolvedValueOnce({ items: [] })

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(screen.getByText('owner@example.com')).toBeTruthy()
    })
    expect(screen.queryByText('@ou_4a3321fb363a87913a7fc408e4945e05')).toBeNull()
  })

  it('falls back to handle when email is missing', async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        id: 'u1',
        handle: 'ou_4a3321fb363a87913a7fc408e4945e05',
        displayName: 'Demo Owner',
        email: null,
        avatarUrl: null,
        bio: null,
        createdAt: 1,
      })
      .mockResolvedValueOnce({ items: [] })

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(screen.getByText('@ou_4a3321fb363a87913a7fc408e4945e05')).toBeTruthy()
    })
  })
})
