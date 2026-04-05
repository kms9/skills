/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGlobalConfigPath, writeGlobalConfig } from './config'
import { resolveGlobalOptsForBrand } from './cliApp'
import { CLAWHUB_BRAND, YCLAWHUB_BRAND, configureCliBrand } from './runtime'

beforeEach(() => {
  configureCliBrand(CLAWHUB_BRAND)
})

afterEach(() => {
  vi.unstubAllEnvs()
  configureCliBrand(CLAWHUB_BRAND)
})

describe('resolveGlobalOptsForBrand', () => {
  it('prefers explicit values over active environment and env vars for yclawhub', async () => {
    vi.stubEnv('YCLAWHUB_CONFIG_PATH', '/tmp/yclawhub-config-priority.json')
    configureCliBrand(YCLAWHUB_BRAND)
    await writeGlobalConfig({
      activeEnv: 'prod',
      envs: [
        {
          name: 'prod',
          site: 'https://prod.example.com',
          registry: 'https://api.prod.example.com',
          token: 'prod-token',
        },
      ],
    })
    vi.stubEnv('YCLAWHUB_SITE', 'https://env.example.com')
    vi.stubEnv('YCLAWHUB_REGISTRY', 'https://api.env.example.com')

    const opts = await resolveGlobalOptsForBrand(YCLAWHUB_BRAND, {
      workdir: '/repo',
      site: 'https://cli.example.com',
      registry: 'https://api.cli.example.com',
      env: 'prod',
    })

    expect(opts.site).toBe('https://cli.example.com')
    expect(opts.registry).toBe('https://api.cli.example.com')
    expect(opts.registrySource).toBe('cli')
    expect(opts.envName).toBe('prod')
  })

  it('prefers active environment over YCLAWHUB env vars', async () => {
    vi.stubEnv('YCLAWHUB_CONFIG_PATH', '/tmp/yclawhub-config-active.json')
    configureCliBrand(YCLAWHUB_BRAND)
    await writeGlobalConfig({
      activeEnv: 'staging',
      envs: [
        {
          name: 'staging',
          site: 'https://staging.example.com',
          registry: 'https://api.staging.example.com',
          authBase: 'https://auth.staging.example.com',
        },
      ],
    })
    vi.stubEnv('YCLAWHUB_SITE', 'https://env.example.com')
    vi.stubEnv('YCLAWHUB_REGISTRY', 'https://api.env.example.com')

    const opts = await resolveGlobalOptsForBrand(YCLAWHUB_BRAND, { workdir: '/repo' })

    expect(opts.site).toBe('https://staging.example.com')
    expect(opts.registry).toBe('https://api.staging.example.com')
    expect(opts.authBase).toBe('https://auth.staging.example.com')
    expect(opts.registrySource).toBe('active')
    expect(opts.envName).toBe('staging')
  })
})

describe('global config path isolation', () => {
  it('uses independent config path prefixes', () => {
    vi.stubEnv('CLAWHUB_CONFIG_PATH', '/tmp/clawhub-config.json')
    vi.stubEnv('YCLAWHUB_CONFIG_PATH', '/tmp/yclawhub-config.json')

    configureCliBrand(CLAWHUB_BRAND)
    expect(getGlobalConfigPath()).toBe('/tmp/clawhub-config.json')

    configureCliBrand(YCLAWHUB_BRAND)
    expect(getGlobalConfigPath()).toBe('/tmp/yclawhub-config.json')
  })
})
