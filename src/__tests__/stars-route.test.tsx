/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from '../routes/stars'

const apiRequestMock = vi.fn()
const authStatusMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  createFileRoute: () => (config: { component: unknown }) => ({
    options: config,
  }),
}))

vi.mock('../lib/apiClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}))

vi.mock('../lib/useAuthStatus', () => ({
  useAuthStatus: () => authStatusMock(),
}))

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('/stars route', () => {
  beforeEach(() => {
    apiRequestMock.mockReset()
    authStatusMock.mockReset()
  })

  it('renders empty state from wrapped star list response', async () => {
    authStatusMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      me: { id: 'users:1' },
    })
    apiRequestMock.mockResolvedValueOnce({ items: [] })

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(screen.getByText(/no stars yet/i)).toBeTruthy()
    })
    expect(apiRequestMock).toHaveBeenCalledWith('/users/me/stars')
  })

  it('uses the frontend star endpoint when unstarring', async () => {
    authStatusMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      me: { id: 'users:1' },
    })
    apiRequestMock
      .mockResolvedValueOnce({
        items: [
          {
            slug: 'weather',
            displayName: 'Weather',
            ownerUserId: 'users:2',
            stats: { stars: 3, downloads: 10, installs: 5, versions: 1 },
          },
        ],
      })
      .mockResolvedValueOnce({ ok: 'true' })
      .mockResolvedValueOnce({ items: [] })

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(screen.getByText('Weather')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /unstar weather/i }))

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/skills/weather/star', { method: 'DELETE' })
    })
  })
})
