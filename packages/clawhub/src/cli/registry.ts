import {
  getStoredRegistry,
  readGlobalConfig,
  writeAuthBinding,
  writeGlobalConfig,
} from '../config.js'
import { discoverRegistryFromSite } from '../discovery.js'
import { getCliBrand } from '../runtime.js'
import type { GlobalOpts } from './types.js'

export const DEFAULT_SITE = getCliBrand().defaultSite
export const DEFAULT_REGISTRY = getCliBrand().defaultRegistry

export async function resolveRegistry(opts: GlobalOpts) {
  const explicit = opts.registrySource !== 'default' ? opts.registry.trim() : ''
  if (explicit) return explicit

  const discovery = await discoverRegistryFromSite(opts.site).catch(() => null)
  const discovered = discovery?.apiBase?.trim()
  if (discovered) return discovered

  const cfg = await readGlobalConfig()
  const cached = getStoredRegistry(cfg, opts.envName)
  if (cached) return cached
  return getCliBrand().defaultRegistry
}

export async function getRegistry(opts: GlobalOpts, params?: { cache?: boolean }) {
  const cache = params?.cache !== false
  const registry = await resolveRegistry(opts)
  if (!cache) return registry
  const cfg = await readGlobalConfig()
  const cached = getStoredRegistry(cfg, opts.envName)
  const shouldUpdate =
    !cached || (cached === getCliBrand().defaultRegistry && registry !== getCliBrand().defaultRegistry)
  if (shouldUpdate) {
    await writeGlobalConfig(
      writeAuthBinding(cfg, {
        envName: opts.envName,
        site: opts.site,
        registry,
        authBase: opts.authBase,
        token: cfg?.token,
      }),
    )
  }
  return registry
}
