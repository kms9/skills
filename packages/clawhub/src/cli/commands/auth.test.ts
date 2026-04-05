/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalOpts } from '../types'

const mockReadGlobalConfig = vi.fn(async () => null as { registry?: string; token?: string } | null)
const mockWriteGlobalConfig = vi.fn(async (_cfg: unknown) => {})
vi.mock('../../config.js', () => ({
  readGlobalConfig: () => mockReadGlobalConfig(),
  writeGlobalConfig: (cfg: unknown) => mockWriteGlobalConfig(cfg),
  writeAuthBinding: (
    cfg: { token?: string } | null,
    next: { registry: string; token?: string; site?: string; envName?: string },
  ) => ({
    registry: next.registry,
    token: Object.prototype.hasOwnProperty.call(next, 'token') ? next.token : cfg?.token,
    site: next.site,
    envName: next.envName,
  }),
}))

const mockGetRegistry = vi.fn(async () => 'https://clawhub.ai')
vi.mock('../registry.js', () => ({
  getRegistry: () => mockGetRegistry(),
}))

const mockApiRequest = vi.fn()
vi.mock('../../http.js', () => ({
  apiRequest: (registry: unknown, args: unknown, schema?: unknown) =>
    mockApiRequest(registry, args, schema),
}))

vi.mock('../authToken.js', () => ({
  requireAuthToken: vi.fn(async () => 'gitlab-api-token'),
}))

const spinner = { succeed: vi.fn(), fail: vi.fn() }
vi.mock('../ui.js', () => ({
  createSpinner: vi.fn(() => spinner),
  fail: (message: string) => {
    throw new Error(message)
  },
  formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  openInBrowser: vi.fn(),
  promptHidden: vi.fn(async () => 'prompted-token'),
}))

const { cmdLogin, cmdLogout, cmdWhoami } = await import('./auth')

const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {})

function makeOpts(): GlobalOpts {
  return {
    workdir: '/work',
    dir: '/work/skills',
    site: 'https://clawhub.ai',
    registry: 'https://clawhub.ai',
    registrySource: 'default',
  }
}

afterEach(() => {
  vi.clearAllMocks()
  mockLog.mockClear()
})

describe('cmdLogout', () => {
  it('removes token and logs a clear message', async () => {
    mockReadGlobalConfig.mockResolvedValueOnce({ registry: 'https://clawhub.ai', token: 'tkn' })

    await cmdLogout(makeOpts())

    expect(mockWriteGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        registry: 'https://clawhub.ai',
        token: undefined,
      }),
    )
    expect(mockGetRegistry).toHaveBeenCalled()
    expect(mockLog).toHaveBeenCalledWith(
      'OK. Logged out locally. Token still valid until revoked (Settings -> API tokens).',
    )
  })

  it('falls back to resolved registry when config has no registry', async () => {
    mockReadGlobalConfig.mockResolvedValueOnce({ token: 'tkn' })
    mockGetRegistry.mockResolvedValueOnce('https://registry.example')

    await cmdLogout(makeOpts())

    expect(mockGetRegistry).toHaveBeenCalled()
    expect(mockWriteGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        registry: 'https://registry.example',
        token: undefined,
      }),
    )
  })
})

describe('gitlab-compatible token flows', () => {
  it('stores a token after whoami succeeds during login', async () => {
    mockApiRequest.mockResolvedValueOnce({
      user: {
        handle: 'gitlab-user',
        displayName: 'GitLab User',
        image: null,
      },
    })

    await cmdLogin(makeOpts(), 'gitlab-platform-token', false)

    expect(mockApiRequest).toHaveBeenCalledWith(
      'https://clawhub.ai',
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/whoami',
        token: 'gitlab-platform-token',
      }),
      expect.anything(),
    )
    expect(mockWriteGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        registry: 'https://clawhub.ai',
        token: 'gitlab-platform-token',
      }),
    )
    expect(spinner.succeed).toHaveBeenCalledWith('OK. Logged in as @gitlab-user.')
  })

  it('uses the saved platform token for whoami', async () => {
    mockApiRequest.mockResolvedValueOnce({
      user: {
        handle: 'gitlab-user',
        displayName: 'GitLab User',
        image: null,
      },
    })

    await cmdWhoami(makeOpts())

    expect(mockApiRequest).toHaveBeenCalledWith(
      'https://clawhub.ai',
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/whoami',
        token: 'gitlab-api-token',
      }),
      expect.anything(),
    )
    expect(spinner.succeed).toHaveBeenCalledWith('gitlab-user')
  })
})
