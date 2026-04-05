import {
  getBackendBase,
  getCliNpmRegistryValue,
  getCliPackageNameValue,
  getCliSkillRegistryValue,
  getSiteUrlEnv,
  normalizeOriginLike,
} from './env'

export function getCliNpmRegistry() {
  return getCliNpmRegistryValue()
}

export function getCliPackageName() {
  return getCliPackageNameValue()
}

export function getSkillRegistryForInstall() {
  return (
    getCliSkillRegistryValue() ??
    getBackendBase() ??
    normalizeOriginLike(getSiteUrlEnv()) ??
    (typeof window !== 'undefined' ? normalizeOriginLike(window.location.origin) : null) ??
    'http://localhost:10091'
  )
}

export function buildNpmInstallCommand(exampleSlug: string) {
  return `npx --registry ${getCliNpmRegistry()} ${getCliPackageName()} install ${exampleSlug} --registry ${getSkillRegistryForInstall()}`
}
