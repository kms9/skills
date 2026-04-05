/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalOpts } from './types'

const readGlobalConfig = vi.fn()
const writeGlobalConfig = vi.fn()
const discoverRegistryFromSite = vi.fn()

vi.mock('../config.js', () => ({
  readGlobalConfig: (...args: unknown[]) => readGlobalConfig(...args),
  writeGlobalConfig: (...args: unknown[]) => writeGlobalConfig(...args),
  getStoredRegistry: (cfg: { registry?: string } | null) => cfg?.registry,
  writeAuthBinding: (
    cfg: { token?: string } | null,
    next: { registry: string; token?: string },
  ) => ({
    registry: next.registry,
    token: next.token ?? cfg?.token,
  }),
}))

vi.mock('../discovery.js', () => ({
  discoverRegistryFromSite: (...args: unknown[]) => discoverRegistryFromSite(...args),
}))

const { DEFAULT_REGISTRY, getRegistry, resolveRegistry } = await import('./registry')

function makeOpts(overrides: Partial<GlobalOpts> = {}): GlobalOpts {
  return {
    workdir: '/work',
    dir: '/work/skills',
    site: 'https://clawhub.ai',
    registry: DEFAULT_REGISTRY,
    registrySource: 'default',
    ...overrides,
  }
}

beforeEach(() => {
  readGlobalConfig.mockReset()
  writeGlobalConfig.mockReset()
  discoverRegistryFromSite.mockReset()
})

describe('registry resolution', () => {
  it('prefers explicit registry over discovery/cache', async () => {
    readGlobalConfig.mockResolvedValue({ registry: 'https://cached.example.com' })
    discoverRegistryFromSite.mockResolvedValue({ apiBase: 'https://clawhub.ai' })

    const registry = await resolveRegistry(
      makeOpts({ registry: 'https://custom.example', registrySource: 'cli' }),
    )

    expect(registry).toBe('https://custom.example')
    expect(discoverRegistryFromSite).not.toHaveBeenCalled()
  })

  it('updates cache when discovery returns a non-default registry', async () => {
    readGlobalConfig.mockResolvedValue({ registry: 'https://clawhub.ai', token: 'tkn' })
    discoverRegistryFromSite.mockResolvedValue({ apiBase: 'https://skills.example.com' })

    const registry = await getRegistry(makeOpts(), { cache: true })

    expect(registry).toBe('https://skills.example.com')
    expect(writeGlobalConfig).toHaveBeenCalledWith({
      registry: 'https://skills.example.com',
      token: 'tkn',
    })
  })

  it('uses cached registry when discovery is unavailable', async () => {
    readGlobalConfig.mockResolvedValue({ registry: 'https://cached.example.com', token: 'tkn' })
    discoverRegistryFromSite.mockResolvedValue({ apiBase: 'https://clawhub.ai' })

    const registry = await getRegistry(makeOpts(), { cache: true })

    expect(registry).toBe('https://clawhub.ai')
    expect(writeGlobalConfig).not.toHaveBeenCalled()
  })
})
