export type GlobalOpts = {
  workdir: string
  dir: string
  site: string
  registry: string
  registrySource: 'cli' | 'active' | 'env' | 'default'
  envName?: string
  authBase?: string
}

export type ResolveResult = {
  match: { version: string } | null
  latestVersion: { version: string } | null
}
