/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from '../routes/my/skills/index'

const navigateMock = vi.fn()
let searchMock: Record<string, unknown> = {}
const apiRequestMock = vi.fn()
const authStatusMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  createFileRoute: () => (config: { component: unknown; validateSearch?: unknown }) => ({
    options: config,
    useSearch: () => searchMock,
    useNavigate: () => navigateMock,
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

describe('/my/skills route', () => {
  beforeEach(() => {
    searchMock = {}
    navigateMock.mockReset()
    apiRequestMock.mockReset()
    authStatusMock.mockReset()
  })

  it('shows sign in state when unauthenticated', () => {
    authStatusMock.mockReturnValue({ me: null, isLoading: false })

    renderWithProviders(<Route.options.component />)

    expect(screen.getByText(/sign in to manage your skills/i)).toBeTruthy()
  })

  it('renders the managed skill list for the current user', async () => {
    authStatusMock.mockReturnValue({
      me: { handle: 'zhibin', isSuperuser: false },
      isLoading: false,
    })
    apiRequestMock.mockResolvedValueOnce({
      items: [
        {
          id: '1',
          slug: 'demo-skill',
          displayName: 'Demo Skill',
          summary: 'Summary',
          tags: ['latest'],
          stats: { downloads: 0, installs: 0, versions: 1, stars: 0 },
          createdAt: 1,
          updatedAt: 1,
          latestVersion: { version: '1.0.0', createdAt: 1, changelog: 'init' },
          isDeleted: false,
          status: 'active',
        },
      ],
    })

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(screen.getByText('Demo Skill')).toBeTruthy()
    })
    expect(screen.getByText(/manage your published skills/i)).toBeTruthy()
  })
})
