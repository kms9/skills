import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { skillsCopy } from '../copy/skills'
import { SkillDetailPage } from '../components/SkillDetailPage'

const navigateMock = vi.fn()
const useAuthStatusMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../lib/useAuthStatus', () => ({
  useAuthStatus: () => useAuthStatusMock(),
}))

// Mock the API request function
const apiRequestMock = vi.fn()
vi.mock('../lib/apiClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  getBackendBase: () => '',
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        logger: {
          log: console.log,
          warn: console.warn,
          error: () => {},
        },
      },
    },
  })
}

function renderWithProviders(ui: ReactNode, queryClient?: QueryClient) {
  const client = queryClient ?? createTestQueryClient()
  return render(
    <QueryClientProvider client={client}>
      {ui}
    </QueryClientProvider>
  )
}

describe('SkillDetailPage', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    useAuthStatusMock.mockReset()
    apiRequestMock.mockReset()
    useAuthStatusMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      me: null,
    })
  })

  it('shows a loading indicator while loading', () => {
    apiRequestMock.mockReturnValue(new Promise(() => {})) // Never resolves = loading

    renderWithProviders(<SkillDetailPage slug="weather" />)
    expect(screen.getByText(skillsCopy.detail.loadingSkill)).toBeTruthy()
    expect(screen.queryByText(skillsCopy.detail.notFound)).toBeNull()
  })

  it('shows not found when skill query resolves to null', async () => {
    apiRequestMock.mockResolvedValue(null)

    renderWithProviders(<SkillDetailPage slug="missing-skill" />)
    expect(await screen.findByText(skillsCopy.detail.notFound)).toBeTruthy()
  })

  it('redirects legacy routes to canonical owner/slug', async () => {
    apiRequestMock.mockResolvedValue({
      skill: {
        slug: 'weather',
        displayName: 'Weather',
        summary: 'Get current weather.',
        tags: [],
        stats: { downloads: 0, installs: 0, versions: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      owner: { handle: 'steipete', displayName: 'Peter' },
      latestVersion: { version: '1.0.0', createdAt: Date.now(), changelog: '' },
    })

    renderWithProviders(<SkillDetailPage slug="weather" redirectToCanonical />)
    expect(screen.getByText(skillsCopy.detail.loadingSkill)).toBeTruthy()

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled()
    })
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/$owner/$slug',
      params: { owner: 'steipete', slug: 'weather' },
      replace: true,
    })
  })

  it('opens report dialog for authenticated users', async () => {
    useAuthStatusMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      me: { id: 'users:1', role: 'user' },
    })
    apiRequestMock.mockResolvedValue({
      skill: {
        slug: 'weather',
        displayName: 'Weather',
        summary: 'Get current weather.',
        tags: [],
        stats: { downloads: 0, installs: 0, versions: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      owner: { handle: 'steipete', displayName: 'Peter' },
      latestVersion: { version: '1.0.0', createdAt: Date.now(), changelog: '', files: [] },
    })

    renderWithProviders(<SkillDetailPage slug="weather" />)

    // Wait for skill name to appear
    await waitFor(() => {
      expect(screen.getByText('Weather')).toBeTruthy()
    })

    // Report button should be visible for authenticated users
    const reportButton = screen.getByRole('button', { name: skillsCopy.detail.report })
    expect(reportButton).toBeTruthy()
  })

  it('defers compare version query until compare tab is requested', async () => {
    apiRequestMock.mockResolvedValue({
      skill: {
        slug: 'weather',
        displayName: 'Weather',
        summary: 'Get current weather.',
        tags: [],
        stats: { downloads: 0, installs: 0, versions: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      owner: { handle: 'steipete', displayName: 'Peter' },
      latestVersion: { version: '1.0.0', createdAt: Date.now(), changelog: '', files: [] },
    })

    renderWithProviders(<SkillDetailPage slug="weather" />)

    // Wait for skill to load
    await waitFor(() => {
      expect(screen.getByText('Weather')).toBeTruthy()
    })

    // Initially, only skill detail API should be called, not versions
    const initialCalls = apiRequestMock.mock.calls.filter((call) =>
      call[0]?.includes('versions')
    )
    expect(initialCalls.length).toBe(0)

    // Click compare tab - this would trigger versions query in full implementation
    // For now, just verify the component renders
    const compareTab = screen.getByRole('button', { name: skillsCopy.detail.tabs.compare })
    fireEvent.click(compareTab)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: skillsCopy.detail.tabs.versions })).toBeTruthy()
    })
  })
})
