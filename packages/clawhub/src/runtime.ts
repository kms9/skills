export type CliBrand = {
  id: 'clawhub' | 'yclawhub'
  displayName: string
  packageName: string
  commandName: string
  defaultSite: string
  defaultRegistry: string
  configDirName: string
  workspaceDirName: string
  workspaceReadDirs: string[]
  ignoreFileName: string
  ignoreReadFiles: string[]
  envPrefix: string
}

export const CLAWHUB_BRAND: CliBrand = {
  id: 'clawhub',
  displayName: 'ClawHub',
  packageName: 'clawhub',
  commandName: 'clawhub',
  defaultSite: 'https://clawhub.ai',
  defaultRegistry: 'https://clawhub.ai',
  configDirName: 'clawhub',
  workspaceDirName: '.clawhub',
  workspaceReadDirs: ['.clawhub'],
  ignoreFileName: '.clawhubignore',
  ignoreReadFiles: ['.clawhubignore'],
  envPrefix: 'CLAWHUB',
}

export const YCLAWHUB_BRAND: CliBrand = {
  id: 'yclawhub',
  displayName: 'YClawHub',
  packageName: 'yclawhub',
  commandName: 'yclawhub',
  defaultSite: 'https://clawhub.ai',
  defaultRegistry: 'https://clawhub.ai',
  configDirName: 'yclawhub',
  workspaceDirName: '.yclawhub',
  workspaceReadDirs: ['.yclawhub'],
  ignoreFileName: '.yclawhubignore',
  ignoreReadFiles: ['.yclawhubignore'],
  envPrefix: 'YCLAWHUB',
}

let currentBrand: CliBrand = CLAWHUB_BRAND

export function configureCliBrand(brand: CliBrand) {
  currentBrand = brand
}

export function getCliBrand() {
  return currentBrand
}

export function getEnvCandidates(name: string) {
  const brand = getCliBrand()
  return [`${brand.envPrefix}_${name}`]
}

export function readBrandEnv(name: string): string | undefined {
  for (const key of getEnvCandidates(name)) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}
