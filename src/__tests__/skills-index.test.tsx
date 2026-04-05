/* @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { skillsCopy } from '../copy/skills'
import { SkillsIndex } from '../routes/skills/index'

const navigateMock = vi.fn()
let searchMock: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (_config: { component: unknown; validateSearch: unknown }) => ({
    useNavigate: () => navigateMock,
    useSearch: () => searchMock,
  }),
  redirect: (options: unknown) => ({ redirect: options }),
  Link: (props: { children: ReactNode }) => <a href="/">{props.children}</a>,
}))

// Mock the API request function
const apiRequestMock = vi.fn()
vi.mock('../lib/apiClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
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

describe('SkillsIndex', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    searchMock = {}
    apiRequestMock.mockReset()
    // Default: return empty results
    apiRequestMock.mockResolvedValue({
      items: [],
      nextCursor: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('requests the first skills page', async () => {
    renderWithProviders(<SkillsIndex />)

    // Wait for the API to be called
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled()
    })

    // Check API was called with correct endpoint
    const firstCall = apiRequestMock.mock.calls[0]
    expect(firstCall[0]).toContain('/skills')
  })

  it('renders an empty state when no skills are returned', async () => {
    renderWithProviders(<SkillsIndex />)

    // Wait for empty state to appear
    expect(await screen.findByText(skillsCopy.browse.empty)).toBeTruthy()
  })

  it('shows loading state when loading', () => {
    // Return a pending promise to simulate loading
    apiRequestMock.mockReturnValue(new Promise(() => {}))

    renderWithProviders(<SkillsIndex />)
    expect(screen.getAllByText(skillsCopy.browse.loading).length).toBeGreaterThan(0)
  })

  it('shows empty state immediately when search returns no results', async () => {
    searchMock = { q: 'nonexistent-skill-xyz' }
    apiRequestMock.mockResolvedValue({ results: [], total: 0 })

    renderWithProviders(<SkillsIndex />)

    // Wait for search API to be called and empty state to appear
    await waitFor(() => {
      expect(screen.getByText(skillsCopy.browse.empty)).toBeTruthy()
    })
  })

  it('displays skills when results are returned', async () => {
    apiRequestMock.mockResolvedValue({
      items: [
        {
          slug: 'test-skill',
          displayName: 'Test Skill',
          summary: 'A test skill',
          tags: ['test'],
          stats: { downloads: 100, installs: 50, versions: 3 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      nextCursor: null,
    })

    renderWithProviders(<SkillsIndex />)

    // Wait for skill to appear
    expect(await screen.findByText('Test Skill')).toBeTruthy()
  })

  it('handles pagination', async () => {
    // First page
    apiRequestMock
      .mockResolvedValueOnce({
        items: [
          {
            slug: 'skill-1',
            displayName: 'Skill 1',
            summary: 'First skill',
            tags: [],
            stats: { downloads: 100, installs: 50, versions: 1 },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        nextCursor: 'cursor-123',
      })
      // Second page
      .mockResolvedValueOnce({
        items: [
          {
            slug: 'skill-2',
            displayName: 'Skill 2',
            summary: 'Second skill',
            tags: [],
            stats: { downloads: 200, installs: 100, versions: 2 },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        nextCursor: null,
      })

    renderWithProviders(<SkillsIndex />)

    // Wait for first page to load
    await waitFor(() => {
      expect(screen.getByText('Skill 1')).toBeTruthy()
    })

    // Click load more
    const loadMoreButton = screen.getByRole('button', { name: skillsCopy.browse.loadMore })
    fireEvent.click(loadMoreButton)

    // Wait for second page
    await waitFor(() => {
      expect(screen.getByText('Skill 2')).toBeTruthy()
    })

    // API should be called twice
    expect(apiRequestMock).toHaveBeenCalledTimes(2)
  })
})
