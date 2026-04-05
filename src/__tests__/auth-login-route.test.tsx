/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authCopy } from '../copy/auth'
import { Route } from '../routes/auth/login'

const navigateMock = vi.fn()
let searchMock: Record<string, unknown> = {}
const originalLocation = window.location

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  createFileRoute: () => (config: { component: unknown }) => ({
    options: config,
    useNavigate: () => navigateMock,
    useSearch: () => searchMock,
  }),
}))

vi.mock('../lib/apiClient', () => ({
  authRequest: vi.fn(),
  buildAuthNavigationUrl: (path: string) => path,
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message)
    }
  },
}))

const requestFeishuAuthCodeMock = vi.fn()
const isFeishuClientMock = vi.fn(() => false)
const getFeishuAppIdMock = vi.fn(() => '')
vi.mock('../lib/feishuAuth', () => ({
  getFeishuAppId: () => getFeishuAppIdMock(),
  isFeishuAvailable: () => false,
  isFeishuClient: () => isFeishuClientMock(),
  requestFeishuAuthCode: () => requestFeishuAuthCodeMock(),
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

describe('/auth/login route', () => {
  beforeEach(() => {
    searchMock = {}
    navigateMock.mockReset()
    requestFeishuAuthCodeMock.mockReset()
    isFeishuClientMock.mockReset()
    isFeishuClientMock.mockReturnValue(false)
    getFeishuAppIdMock.mockReset()
    getFeishuAppIdMock.mockReturnValue('')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: vi.fn(),
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('renders only the feishu login entry', () => {
    renderWithProviders(<Route.options.component />)

    expect(screen.getByRole('button', { name: authCopy.entry.feishu })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /邮箱辅助登录/i })).toBeNull()
    expect(screen.queryByLabelText(/邮箱/i)).toBeNull()
  })

  it('shows oauth review status from search params', () => {
    searchMock = { authError: 'account pending review' }

    renderWithProviders(<Route.options.component />)

    expect(screen.getByText(authCopy.errors.accountPendingReview)).toBeTruthy()
  })

  it('shows feishu unavailable status from search params', () => {
    searchMock = { authError: 'feishu auth unavailable' }

    renderWithProviders(<Route.options.component />)

    expect(screen.getByText(authCopy.errors.feishuLoginFailed)).toBeTruthy()
  })

  it('redirects browser users to feishu oauth login', () => {
    renderWithProviders(<Route.options.component />)

    fireEvent.click(screen.getByRole('button', { name: authCopy.entry.feishu }))

    expect(window.location.assign).toHaveBeenCalledWith('/auth/feishu')
  })
})
