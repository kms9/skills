import { getStoredToken, readGlobalConfig } from '../config.js'
import { getCliBrand } from '../runtime.js'
import type { GlobalOpts } from './types.js'
import { fail } from './ui.js'

export async function getOptionalAuthToken(opts?: GlobalOpts): Promise<string | undefined> {
  const cfg = await readGlobalConfig()
  return getStoredToken(cfg, opts?.envName)
}

export async function requireAuthToken(opts?: GlobalOpts): Promise<string> {
  const token = await getOptionalAuthToken(opts)
  if (!token) fail(`Not logged in. Run: ${getCliBrand().commandName} login`)
  return token
}
