/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchSkills } from '../hooks/useSearchSkills'

const apiRequestMock = vi.fn()

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

function SearchHookProbe({ query }: { query: string }) {
  const { data, isLoading } = useSearchSkills(query)

  if (isLoading) return <div>loading</div>

  return <div>results:{data?.results.length ?? -1}</div>
}

describe('useSearchSkills', () => {
  beforeEach(() => {
    apiRequestMock.mockReset()
  })

  it('consumes wrapped empty results without crashing', async () => {
    apiRequestMock.mockResolvedValueOnce({ results: [] })

    renderWithProviders(<SearchHookProbe query="weather" />)

    await waitFor(() => {
      expect(screen.getByText('results:0')).toBeTruthy()
    })
    expect(apiRequestMock).toHaveBeenCalledWith('/search?q=weather')
  })

  it('does not fire when the trimmed query is empty', async () => {
    renderWithProviders(<SearchHookProbe query="   " />)

    await waitFor(() => {
      expect(screen.getByText('results:-1')).toBeTruthy()
    })
    expect(apiRequestMock).not.toHaveBeenCalled()
  })
})
