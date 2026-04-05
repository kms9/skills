import { discoverRegistryFromSite } from '../../discovery.js'
import {
  deleteEnvironment,
  getActiveEnvironmentName,
  getEnvironmentByName,
  listConfiguredEnvironments,
  readGlobalConfig,
  setActiveEnvironment,
  upsertEnvironment,
  writeGlobalConfig,
} from '../../config.js'
import { getCliBrand } from '../../runtime.js'
import type { GlobalOpts } from '../types.js'
import { fail, promptConfirm } from '../ui.js'

function serializeEnvironment(env: {
  name: string
  site: string
  registry: string
  authBase?: string
  hasToken?: boolean
  token?: string
  lastUsedAt?: number
  isDefault?: boolean
}) {
  return {
    name: env.name,
    site: env.site,
    registry: env.registry,
    authBase: env.authBase ?? null,
    hasToken: Boolean(env.hasToken ?? env.token),
    lastUsedAt: env.lastUsedAt ?? null,
    isDefault: Boolean(env.isDefault),
  }
}

export async function cmdEnvList(options: { json?: boolean }) {
  const cfg = await readGlobalConfig()
  const active = getActiveEnvironmentName(cfg)
  const items = listConfiguredEnvironments(cfg)

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          activeEnv: active ?? null,
          items: items.map((env) => serializeEnvironment(env)),
        },
        null,
        2,
      ),
    )
    return
  }

  if (items.length === 0) {
    console.log('No environments configured.')
    return
  }

  for (const env of items) {
    const activeLabel = env.name === active ? '*' : ' '
    const tokenLabel = env.hasToken ? 'token' : 'no-token'
    console.log(`${activeLabel} ${env.name}  ${env.site}  ${env.registry}  ${tokenLabel}`)
  }
}

export async function cmdEnvAdd(
  _opts: GlobalOpts,
  options: {
    name?: string
    site?: string
    registry?: string
    authBase?: string
    use?: boolean
  },
) {
  const name = options.name?.trim()
  const site = options.site?.trim()
  if (!name) fail('--name is required')
  if (!site) fail('--site is required')

  const discovery = !options.registry || !options.authBase
    ? await discoverRegistryFromSite(site).catch(() => null)
    : null
  const registry = options.registry?.trim() || discovery?.apiBase?.trim() || site
  const authBase = options.authBase?.trim() || discovery?.authBase?.trim() || undefined
  const cfg = await readGlobalConfig()
  const existing = getEnvironmentByName(cfg, name)
  const next = upsertEnvironment(cfg, {
    name,
    site,
    registry,
    authBase,
    token: existing?.token,
    lastUsedAt: Date.now(),
  })
  const shouldActivate = options.use || !getActiveEnvironmentName(next)
  await writeGlobalConfig(shouldActivate ? setActiveEnvironment(next, name) : next)
  console.log(`Saved environment ${name}.`)
}

export async function cmdEnvUse(name: string) {
  const trimmed = name.trim()
  if (!trimmed) fail('Environment name required')
  const cfg = await readGlobalConfig()
  if (!getEnvironmentByName(cfg, trimmed)) fail(`Unknown environment: ${trimmed}`)
  await writeGlobalConfig(setActiveEnvironment(cfg, trimmed))
  console.log(`Active environment: ${trimmed}`)
}

export async function cmdEnvCurrent(options: { json?: boolean }) {
  const cfg = await readGlobalConfig()
  const active = getActiveEnvironmentName(cfg)
  const env = active ? getEnvironmentByName(cfg, active) : null
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          activeEnv: active ?? null,
          environment: env ? serializeEnvironment(env) : null,
        },
        null,
        2,
      ),
    )
    return
  }
  if (!env) {
    console.log('No active environment.')
    return
  }
  console.log(`${env.name}  ${env.site}  ${env.registry}`)
}

export async function cmdEnvRemove(
  name: string,
  options: { yes?: boolean },
  inputAllowed: boolean,
) {
  const trimmed = name.trim()
  if (!trimmed) fail('Environment name required')
  const cfg = await readGlobalConfig()
  const env = getEnvironmentByName(cfg, trimmed)
  if (!env) fail(`Unknown environment: ${trimmed}`)

  if (!options.yes && inputAllowed) {
    const confirmed = await promptConfirm(`Remove environment ${trimmed}?`)
    if (!confirmed) fail('Cancelled')
  }

  await writeGlobalConfig(deleteEnvironment(cfg, trimmed))
  console.log(`Removed environment ${trimmed}.`)
}

export function assertEnvironmentCommandsEnabled() {
  const brand = getCliBrand()
  if (brand.id !== 'yclawhub') fail(`${brand.commandName} does not support env commands`)
}
