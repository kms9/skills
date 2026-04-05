import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { resolveHome } from './homedir.js'
import { getCliBrand, readBrandEnv } from './runtime.js'
import { type GlobalConfig, GlobalConfigSchema, parseArk } from './schema/index.js'

export type CliEnvironment = NonNullable<GlobalConfig['envs']>[number] & {
  hasToken?: boolean
}

function resolveConfigPath(baseDir: string): string {
  const brand = getCliBrand()
  return join(baseDir, brand.configDirName, 'config.json')
}

function isNonFatalChmodError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EPERM' || code === 'ENOTSUP' || code === 'EOPNOTSUPP' || code === 'EINVAL'
}

export function getGlobalConfigPath() {
  const override = readBrandEnv('CONFIG_PATH')
  if (override) return resolve(override)

  const home = resolveHome()

  if (process.platform === 'darwin') {
    return resolveConfigPath(join(home, 'Library', 'Application Support'))
  }

  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) {
    return resolveConfigPath(xdg)
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      return resolveConfigPath(appData)
    }
  }

  return resolveConfigPath(join(home, '.config'))
}

export async function readGlobalConfig(): Promise<GlobalConfig | null> {
  try {
    const raw = await readFile(getGlobalConfigPath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return parseArk(GlobalConfigSchema, parsed, 'Global config')
  } catch {
    return null
  }
}

export async function writeGlobalConfig(config: GlobalConfig) {
  const path = getGlobalConfigPath()
  const dir = dirname(path)

  // Create directory with restricted permissions (owner only)
  await mkdir(dir, { recursive: true, mode: 0o700 })

  // Write file with restricted permissions (owner read/write only)
  // This protects API tokens from being read by other users
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })

  // Ensure permissions on existing files (writeFile mode only applies on create)
  if (process.platform !== 'win32') {
    try {
      await chmod(path, 0o600)
    } catch (error) {
      if (!isNonFatalChmodError(error)) throw error
    }
  }
}

export function listConfiguredEnvironments(config: GlobalConfig | null | undefined) {
  return (config?.envs ?? []).map((env) => ({
    ...env,
    hasToken: Boolean(env.token),
  }))
}

export function getEnvironmentByName(config: GlobalConfig | null | undefined, name: string) {
  return (config?.envs ?? []).find((entry) => entry.name === name) ?? null
}

export function getActiveEnvironmentName(config: GlobalConfig | null | undefined) {
  return config?.activeEnv?.trim() || null
}

export function getStoredToken(config: GlobalConfig | null | undefined, envName?: string) {
  const brand = getCliBrand()
  if (brand.id === 'yclawhub') {
    const selected = getSelectedEnvironment(config, envName)
    return selected?.token?.trim() || undefined
  }
  return config?.token?.trim() || undefined
}

export function getStoredRegistry(config: GlobalConfig | null | undefined, envName?: string) {
  const brand = getCliBrand()
  if (brand.id === 'yclawhub') {
    const selected = getSelectedEnvironment(config, envName)
    return selected?.registry?.trim() || undefined
  }
  return config?.registry?.trim() || undefined
}

export function upsertEnvironment(
  config: GlobalConfig | null | undefined,
  environment: {
    name: string
    site: string
    registry: string
    authBase?: string
    token?: string
    lastUsedAt?: number
    isDefault?: boolean
  },
): GlobalConfig {
  const current = normalizeGlobalConfig(config)
  const envs = (current.envs ?? []).filter((entry) => entry.name !== environment.name)
  envs.push({
    name: environment.name,
    site: environment.site,
    registry: environment.registry,
    authBase: environment.authBase,
    token: environment.token,
    lastUsedAt: environment.lastUsedAt,
    isDefault: environment.isDefault,
  })
  return { ...current, envs }
}

export function setActiveEnvironment(
  config: GlobalConfig | null | undefined,
  name: string | null,
): GlobalConfig {
  const current = normalizeGlobalConfig(config)
  return {
    ...current,
    activeEnv: name,
  }
}

export function deleteEnvironment(config: GlobalConfig | null | undefined, name: string): GlobalConfig {
  const current = normalizeGlobalConfig(config)
  const envs = (current.envs ?? []).filter((entry) => entry.name !== name)
  return {
    ...current,
    envs,
    activeEnv: current.activeEnv === name ? null : current.activeEnv,
  }
}

export function writeAuthBinding(
  config: GlobalConfig | null | undefined,
  params: {
    envName?: string
    site: string
    registry: string
    authBase?: string
    token?: string
  },
): GlobalConfig {
  const brand = getCliBrand()
  if (brand.id !== 'yclawhub') {
    return {
      ...normalizeGlobalConfig(config),
      registry: params.registry,
      token: params.token,
    }
  }

  const name = params.envName?.trim() || inferEnvironmentName(params.site)
  const current = normalizeGlobalConfig(config)
  const existing = getEnvironmentByName(current, name)
  const next = upsertEnvironment(current, {
    name,
    site: params.site,
    registry: params.registry,
    authBase: params.authBase ?? existing?.authBase,
    token: params.token,
    lastUsedAt: Date.now(),
    isDefault: existing?.isDefault,
  })
  return setActiveEnvironment(next, name)
}

function normalizeGlobalConfig(config: GlobalConfig | null | undefined): GlobalConfig {
  return {
    registry: config?.registry,
    token: config?.token,
    activeEnv: config?.activeEnv ?? null,
    envs: [...(config?.envs ?? [])],
  }
}

function getSelectedEnvironment(config: GlobalConfig | null | undefined, envName?: string) {
  const selectedName = envName?.trim() || getActiveEnvironmentName(config)
  if (!selectedName) return null
  return getEnvironmentByName(config, selectedName)
}

function inferEnvironmentName(site: string) {
  try {
    return new URL(site).hostname.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'default'
  } catch {
    return 'default'
  }
}
