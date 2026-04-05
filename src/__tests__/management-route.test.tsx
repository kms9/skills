/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from '../routes/management'

const navigateMock = vi.fn()
let searchMock: Record<string, unknown> = {}
const apiRequestMock = vi.fn()
const authStatusMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: unknown; validateSearch?: unknown }) => ({
    options: config,
    useSearch: () => searchMock,
    useNavigate: () => navigateMock,
  }),
}))

vi.mock('../lib/apiClient', async () => {
  class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message)
    }
  }
  return {
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    ApiError,
  }
})

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

describe('/management route', () => {
  beforeEach(() => {
    searchMock = {}
    navigateMock.mockReset()
    apiRequestMock.mockReset()
    authStatusMock.mockReset()
  })

  it('renders the skill management view by default', async () => {
    authStatusMock.mockReturnValue({
      me: { handle: 'superuserlogo', isSuperuser: true },
      isLoading: false,
    })
    apiRequestMock.mockResolvedValueOnce({
      items: [
        {
          id: 's1',
          slug: 'demo-skill',
          displayName: 'Demo Skill',
          summary: null,
          tags: ['latest'],
          stats: { downloads: 0, installs: 0, versions: 1, stars: 0 },
          highlighted: true,
          createdAt: 1,
          updatedAt: 1,
          latestVersion: { version: '1.0.0', createdAt: 1, changelog: 'init' },
          isDeleted: false,
          status: 'active',
          owner: { handle: 'zhibin', displayName: 'Zhibin' },
        },
      ],
    })

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(screen.getByText('Demo Skill')).toBeTruthy()
    })
    expect(screen.getByText(/管理全站技能，并处理技能生命周期。/i)).toBeTruthy()
    expect(screen.getByText(/精选：是/i)).toBeTruthy()
    expect(apiRequestMock).toHaveBeenCalledWith('/admin/skills?')
  })

  it('renders unified no-access copy on permission error', async () => {
    const { ApiError } = await import('../lib/apiClient')
    authStatusMock.mockReturnValue({
      me: { handle: 'user-logo', isSuperuser: false },
      isLoading: false,
    })
    apiRequestMock.mockRejectedValueOnce(new ApiError('forbidden', 403))

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(screen.getByText(/当前账号无权访问管理后台。/i)).toBeTruthy()
    })
  })

  it('does not request admin user review endpoints', async () => {
    authStatusMock.mockReturnValue({
      me: { handle: 'superuserlogo', isSuperuser: true },
      isLoading: false,
    })
    apiRequestMock.mockResolvedValueOnce({ items: [] })

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled()
    })
    expect(apiRequestMock).not.toHaveBeenCalledWith(expect.stringMatching(/\/admin\/users/))
  })

  it('toggles highlighted status from management view', async () => {
    authStatusMock.mockReturnValue({
      me: { handle: 'superuserlogo', isSuperuser: true },
      isLoading: false,
    })
    apiRequestMock.mockResolvedValueOnce({
      items: [
        {
          id: 's1',
          slug: 'demo-skill',
          displayName: 'Demo Skill',
          summary: null,
          tags: ['latest'],
          stats: { downloads: 0, installs: 0, versions: 1, stars: 0 },
          highlighted: false,
          createdAt: 1,
          updatedAt: 1,
          latestVersion: { version: '1.0.0', createdAt: 1, changelog: 'init' },
          isDeleted: false,
          status: 'active',
          owner: { handle: 'zhibin', displayName: 'Zhibin' },
        },
      ],
    })
    apiRequestMock.mockResolvedValueOnce({ ok: 'updated', highlighted: true })
    apiRequestMock.mockResolvedValueOnce({ items: [] })

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(screen.getByText('Demo Skill')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '设为精选' }))

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/admin/skills/demo-skill/highlighted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlighted: true }),
      })
    })
  })

  it('prefers owner email over handle in management list', async () => {
    authStatusMock.mockReturnValue({
      me: { handle: 'superuserlogo', isSuperuser: true },
      isLoading: false,
    })
    apiRequestMock.mockResolvedValueOnce({
      items: [
        {
          id: 's1',
          slug: 'demo-skill',
          displayName: 'Demo Skill',
          summary: null,
          tags: ['latest'],
          stats: { downloads: 0, installs: 0, versions: 1, stars: 0 },
          highlighted: false,
          createdAt: 1,
          updatedAt: 1,
          latestVersion: { version: '1.0.0', createdAt: 1, changelog: 'init' },
          isDeleted: false,
          status: 'active',
          owner: {
            handle: 'uid-like-handle',
            displayName: 'Demo Owner',
            email: 'owner@example.com',
          },
        },
      ],
    })

    renderWithProviders(<Route.options.component />)

    await waitFor(() => {
      expect(screen.getByText(/作者：owner@example\.com/i)).toBeTruthy()
    })
    expect(screen.queryByText(/作者：@uid-like-handle/i)).toBeNull()
  })
})
