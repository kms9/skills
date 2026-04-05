import { getBrandName, getSkillsBrandName, getSoulsBrandName } from './brand'
import { getSiteModeEnv, getSiteUrl, getSiteUrlEnv, getSoulHost, getSoulSiteUrl } from './env'

export type SiteMode = 'skills' | 'souls'

const DEFAULT_CLAWHUB_SITE_URL = 'https://clawhub.ai'
const DEFAULT_ONLYCRABS_HOST = 'onlycrabs.ai'

export function normalizeClawHubSiteOrigin(value?: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    return null
  }
}

export function getClawHubSiteUrl() {
  return normalizeClawHubSiteOrigin(getSiteUrl()) ?? DEFAULT_CLAWHUB_SITE_URL
}

export function getOnlyCrabsSiteUrl() {
  return getSoulSiteUrl()
}

export function getOnlyCrabsHost() {
  const host = getSoulHost().trim()
  return host || DEFAULT_ONLYCRABS_HOST
}

export function detectSiteMode(host?: string | null): SiteMode {
  if (!host) return 'skills'
  const onlyCrabsHost = getOnlyCrabsHost().toLowerCase()
  const lower = host.toLowerCase()
  if (lower === onlyCrabsHost || lower.endsWith(`.${onlyCrabsHost}`)) return 'souls'
  return 'skills'
}

export function detectSiteModeFromUrl(value?: string | null): SiteMode {
  if (!value) return 'skills'
  try {
    const host = new URL(value).hostname
    return detectSiteMode(host)
  } catch {
    return detectSiteMode(value)
  }
}

export function getSiteMode(): SiteMode {
  if (typeof window !== 'undefined') {
    return detectSiteMode(window.location.hostname)
  }
  const forced = getSiteModeEnv()
  if (forced === 'souls' || forced === 'skills') return forced

  const onlyCrabsSite = getSoulSiteUrl()
  if (onlyCrabsSite) return detectSiteModeFromUrl(onlyCrabsSite)

  const siteUrl = getSiteUrlEnv()
  if (siteUrl) return detectSiteModeFromUrl(siteUrl)

  return 'skills'
}

export function getSiteName(mode: SiteMode = getSiteMode()) {
  return getBrandName(mode)
}

export function getSiteDescription(mode: SiteMode = getSiteMode()) {
  return mode === 'souls'
    ? `${getSoulsBrandName()} — the home for SOUL.md bundles and personal system lore.`
    : `${getSkillsBrandName()} — a fast skill registry for agents, with vector search.`
}

export function getSiteUrlForMode(mode: SiteMode = getSiteMode()) {
  return mode === 'souls' ? getOnlyCrabsSiteUrl() : getClawHubSiteUrl()
}
