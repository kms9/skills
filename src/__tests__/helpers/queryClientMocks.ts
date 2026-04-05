import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

export function createTestQueryClient() {
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

export function renderWithProviders(ui: ReactNode, { queryClient }: { queryClient?: QueryClient } = {}) {
  const client = queryClient ?? createTestQueryClient()

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    )
  }

  const renderResult = require('@testing-library/react').render(ui, { wrapper: Wrapper })
  return { ...renderResult, queryClient: client }
}
