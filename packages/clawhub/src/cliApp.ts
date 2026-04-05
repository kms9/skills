import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import { getCliBuildLabel, getCliVersion } from './cli/buildInfo.js'
import { resolveClawdbotDefaultWorkspace } from './cli/clawdbotConfig.js'
import { cmdLoginFlow, cmdLogout, cmdWhoami } from './cli/commands/auth.js'
import {
  cmdDeleteSkill,
  cmdHideSkill,
  cmdUndeleteSkill,
  cmdUnhideSkill,
} from './cli/commands/delete.js'
import {
  assertEnvironmentCommandsEnabled,
  cmdEnvAdd,
  cmdEnvCurrent,
  cmdEnvList,
  cmdEnvRemove,
  cmdEnvUse,
} from './cli/commands/env.js'
import { cmdInspect } from './cli/commands/inspect.js'
import { cmdBanUser, cmdSetRole } from './cli/commands/moderation.js'
import { cmdPublish } from './cli/commands/publish.js'
import {
  cmdExplore,
  cmdInstall,
  cmdList,
  cmdSearch,
  cmdUninstall,
  cmdUpdate,
} from './cli/commands/skills.js'
import { cmdStarSkill } from './cli/commands/star.js'
import { cmdSync } from './cli/commands/sync.js'
import { cmdUnstarSkill } from './cli/commands/unstar.js'
import { configureCommanderHelp, styleEnvBlock, styleTitle } from './cli/helpStyle.js'
import type { GlobalOpts } from './cli/types.js'
import { fail } from './cli/ui.js'
import {
  getActiveEnvironmentName,
  getStoredToken,
  readGlobalConfig,
} from './config.js'
import { configureCliBrand, getCliBrand, readBrandEnv, type CliBrand } from './runtime.js'

type ProgramOpts = {
  workdir?: string
  dir?: string
  site?: string
  registry?: string
  authBase?: string
  env?: string
  input?: boolean
}

export function createCliProgram(brand: CliBrand) {
  configureCliBrand(brand)
  const program = new Command()
    .name(brand.commandName)
    .description(
      `${styleTitle(`${brand.displayName} CLI ${getCliBuildLabel()}`)}\n${styleEnvBlock(
        'install, update, search, and publish agent skills.',
      )}`,
    )
    .version(getCliVersion(), '-V, --cli-version', 'Show CLI version')
    .option('--workdir <dir>', 'Working directory (default: cwd)')
    .option('--dir <dir>', 'Skills directory (relative to workdir, default: skills)')
    .option('--site <url>', 'Site base URL (for browser login)')
    .option('--registry <url>', 'Registry API base URL')
    .option('--auth-base <url>', 'Auth base URL override')
    .option('--no-input', 'Disable prompts')
    .showHelpAfterError()
    .showSuggestionAfterError()

  if (brand.id === 'yclawhub') {
    program.option('--env <name>', 'Environment name')
  }

  const envLines = ['Env:', `  ${brand.envPrefix}_SITE`, `  ${brand.envPrefix}_REGISTRY`]
  if (brand.id === 'yclawhub') {
    envLines.push(`  ${brand.envPrefix}_AUTH_BASE`, `  ${brand.envPrefix}_ENV`)
  }
  envLines.push(`  ${brand.envPrefix}_WORKDIR`)
  program.addHelpText('after', styleEnvBlock(`\n${envLines.join('\n')}\n`))

  configureCommanderHelp(program)

  async function resolveGlobalOpts(): Promise<GlobalOpts> {
    return resolveGlobalOptsForBrand(brand, program.opts<ProgramOpts>())
  }

  function isInputAllowed() {
    const globalFlags = program.opts<ProgramOpts>()
    return globalFlags.input !== false
  }

  program
    .command('login')
    .description('Log in (opens browser or stores token)')
    .option('--token <token>', 'API token')
    .option('--label <label>', 'Token label (browser flow only)', 'CLI token')
    .option('--no-browser', 'Do not open browser (requires --token)')
    .action(async (options) => {
      const opts = await resolveGlobalOpts()
      await cmdLoginFlow(opts, options, isInputAllowed())
    })

  program
    .command('logout')
    .description('Remove stored token')
    .action(async () => {
      const opts = await resolveGlobalOpts()
      await cmdLogout(opts)
    })

  program
    .command('whoami')
    .description('Validate token')
    .action(async () => {
      const opts = await resolveGlobalOpts()
      await cmdWhoami(opts)
    })

  const auth = program
    .command('auth')
    .description('Authentication commands')
    .showHelpAfterError()
    .showSuggestionAfterError()

  auth
    .command('login')
    .description('Log in (opens browser or stores token)')
    .option('--token <token>', 'API token')
    .option('--label <label>', 'Token label (browser flow only)', 'CLI token')
    .option('--no-browser', 'Do not open browser (requires --token)')
    .action(async (options) => {
      const opts = await resolveGlobalOpts()
      await cmdLoginFlow(opts, options, isInputAllowed())
    })

  auth
    .command('logout')
    .description('Remove stored token')
    .action(async () => {
      const opts = await resolveGlobalOpts()
      await cmdLogout(opts)
    })

  auth
    .command('whoami')
    .description('Validate token')
    .action(async () => {
      const opts = await resolveGlobalOpts()
      await cmdWhoami(opts)
    })

  if (brand.id === 'yclawhub') {
    const env = program.command('env').description('Manage private environments')

    env
      .command('list')
      .option('--json', 'Output JSON')
      .action(async (options) => {
        assertEnvironmentCommandsEnabled()
        await cmdEnvList(options)
      })

    env
      .command('add')
      .requiredOption('--name <name>', 'Environment name')
      .requiredOption('--site <url>', 'Site base URL')
      .option('--registry <url>', 'Registry API base URL')
      .option('--auth-base <url>', 'Auth base URL')
      .option('--use', 'Activate after saving')
      .action(async (options) => {
        assertEnvironmentCommandsEnabled()
        const opts = await resolveGlobalOpts()
        await cmdEnvAdd(opts, options)
      })

    env
      .command('use')
      .argument('<name>', 'Environment name')
      .action(async (name) => {
        assertEnvironmentCommandsEnabled()
        await cmdEnvUse(name)
      })

    env
      .command('current')
      .option('--json', 'Output JSON')
      .action(async (options) => {
        assertEnvironmentCommandsEnabled()
        await cmdEnvCurrent(options)
      })

    env
      .command('remove')
      .argument('<name>', 'Environment name')
      .option('--yes', 'Skip confirmation')
      .action(async (name, options) => {
        assertEnvironmentCommandsEnabled()
        await cmdEnvRemove(name, options, isInputAllowed())
      })
  }

  program
    .command('search')
    .description('Vector search skills')
    .argument('<query...>', 'Query string')
    .option('--limit <n>', 'Max results', (value) => Number.parseInt(value, 10))
    .action(async (queryParts, options) => {
      const opts = await resolveGlobalOpts()
      const query = queryParts.join(' ').trim()
      await cmdSearch(opts, query, options.limit)
    })

  program
    .command('install')
    .description('Install into <dir>/<slug>')
    .argument('<slug>', 'Skill slug')
    .option('--version <version>', 'Version to install')
    .option('--force', 'Overwrite existing folder')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdInstall(opts, slug, options.version, options.force)
    })

  program
    .command('update')
    .description('Update installed skills')
    .argument('[slug]', 'Skill slug')
    .option('--all', 'Update all installed skills')
    .option('--version <version>', 'Update to specific version (single slug only)')
    .option('--force', 'Overwrite when local files do not match any version')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdUpdate(opts, slug, options, isInputAllowed())
    })

  program
    .command('uninstall')
    .description('Uninstall a skill')
    .argument('<slug>', 'Skill slug')
    .option('--yes', 'Skip confirmation')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdUninstall(opts, slug, options, isInputAllowed())
    })

  program
    .command('list')
    .description('List installed skills (from lockfile)')
    .action(async () => {
      const opts = await resolveGlobalOpts()
      await cmdList(opts)
    })

  program
    .command('explore')
    .description('Browse latest updated skills from the registry')
    .option(
      '--limit <n>',
      'Number of skills to show (max 200)',
      (value) => Number.parseInt(value, 10),
      25,
    )
    .option(
      '--sort <order>',
      'Sort by newest, downloads, rating, installs, installsAllTime, or trending',
      'newest',
    )
    .option('--json', 'Output JSON')
    .action(async (options) => {
      const opts = await resolveGlobalOpts()
      const limit =
        typeof options.limit === 'number' && Number.isFinite(options.limit) ? options.limit : 25
      await cmdExplore(opts, { limit, sort: options.sort, json: options.json })
    })

  program
    .command('inspect')
    .description('Fetch skill metadata and files without installing')
    .argument('<slug>', 'Skill slug')
    .option('--version <version>', 'Version to inspect')
    .option('--tag <tag>', 'Tag to inspect (default: latest)')
    .option('--versions', 'List version history (first page)')
    .option('--limit <n>', 'Max versions to list (1-200)', (value) => Number.parseInt(value, 10))
    .option('--files', 'List files for the selected version')
    .option('--file <path>', 'Fetch raw file content (text <= 200KB)')
    .option('--json', 'Output JSON')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdInspect(opts, slug, options)
    })

  program
    .command('publish')
    .description('Publish skill from folder')
    .argument('<path>', 'Skill folder path')
    .option('--slug <slug>', 'Skill slug')
    .option('--name <name>', 'Display name')
    .option('--version <version>', 'Version (semver)')
    .option('--fork-of <slug[@version]>', 'Mark as a fork of an existing skill')
    .option('--changelog <text>', 'Changelog text')
    .option('--tags <tags>', 'Comma-separated tags', 'latest')
    .action(async (folder, options) => {
      const opts = await resolveGlobalOpts()
      await cmdPublish(opts, folder, options)
    })

  program
    .command('delete')
    .description('Soft-delete a skill (owner, moderator, or admin)')
    .argument('<slug>', 'Skill slug')
    .option('--yes', 'Skip confirmation')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdDeleteSkill(opts, slug, options, isInputAllowed())
    })

  program
    .command('hide')
    .description('Hide a skill (owner, moderator, or admin)')
    .argument('<slug>', 'Skill slug')
    .option('--yes', 'Skip confirmation')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdHideSkill(opts, slug, options, isInputAllowed())
    })

  program
    .command('undelete')
    .description('Restore a hidden skill (owner, moderator, or admin)')
    .argument('<slug>', 'Skill slug')
    .option('--yes', 'Skip confirmation')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdUndeleteSkill(opts, slug, options, isInputAllowed())
    })

  program
    .command('unhide')
    .description('Unhide a skill (owner, moderator, or admin)')
    .argument('<slug>', 'Skill slug')
    .option('--yes', 'Skip confirmation')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdUnhideSkill(opts, slug, options, isInputAllowed())
    })

  program
    .command('ban-user')
    .description('Ban a user and delete owned skills (moderator/admin only)')
    .argument('<handleOrId>', 'User handle (default) or user id')
    .option('--id', 'Treat argument as user id')
    .option('--fuzzy', 'Resolve handle via fuzzy user search (admin only)')
    .option('--reason <reason>', 'Ban reason (optional)')
    .option('--yes', 'Skip confirmation')
    .action(async (handleOrId, options) => {
      const opts = await resolveGlobalOpts()
      await cmdBanUser(opts, handleOrId, options, isInputAllowed())
    })

  program
    .command('set-role')
    .description('Change a user role (admin only)')
    .argument('<handleOrId>', 'User handle (default) or user id')
    .argument('<role>', 'user | moderator | admin')
    .option('--id', 'Treat argument as user id')
    .option('--fuzzy', 'Resolve handle via fuzzy user search (admin only)')
    .option('--yes', 'Skip confirmation')
    .action(async (handleOrId, role, options) => {
      const opts = await resolveGlobalOpts()
      await cmdSetRole(opts, handleOrId, role, options, isInputAllowed())
    })

  program
    .command('star')
    .description('Add a skill to your highlights')
    .argument('<slug>', 'Skill slug')
    .option('--yes', 'Skip confirmation')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdStarSkill(opts, slug, options, isInputAllowed())
    })

  program
    .command('unstar')
    .description('Remove a skill from your highlights')
    .argument('<slug>', 'Skill slug')
    .option('--yes', 'Skip confirmation')
    .action(async (slug, options) => {
      const opts = await resolveGlobalOpts()
      await cmdUnstarSkill(opts, slug, options, isInputAllowed())
    })

  program
    .command('sync')
    .description('Scan local skills and publish new/updated ones')
    .option('--root <dir...>', 'Extra scan roots (one or more)')
    .option('--all', 'Upload all new/updated skills without prompting')
    .option('--dry-run', 'Show what would be uploaded')
    .option('--bump <type>', 'Version bump for updates (patch|minor|major)', 'patch')
    .option('--changelog <text>', 'Changelog to use for updates (non-interactive)')
    .option('--tags <tags>', 'Comma-separated tags', 'latest')
    .option('--concurrency <n>', 'Concurrent registry checks (default: 4)', '4')
    .action(async (options) => {
      const opts = await resolveGlobalOpts()
      const bump = String(options.bump ?? 'patch') as 'patch' | 'minor' | 'major'
      if (!['patch', 'minor', 'major'].includes(bump)) fail('--bump must be patch|minor|major')
      const concurrencyRaw = Number(options.concurrency ?? 4)
      const concurrency = Number.isFinite(concurrencyRaw) ? Math.round(concurrencyRaw) : 4
      if (concurrency < 1 || concurrency > 32) fail('--concurrency must be between 1 and 32')
      await cmdSync(
        opts,
        {
          root: options.root,
          all: options.all,
          dryRun: options.dryRun,
          bump,
          changelog: options.changelog,
          tags: options.tags,
          concurrency,
        },
        isInputAllowed(),
      )
    })

  program.action(async () => {
    const opts = await resolveGlobalOpts()
    const cfg = await readGlobalConfig()
    if (getStoredToken(cfg, opts.envName)) {
      await cmdSync(opts, {}, isInputAllowed())
      return
    }
    program.outputHelp()
    process.exitCode = 0
  })

  return program
}

export async function runCli(brand: CliBrand, argv = process.argv) {
  configureCliBrand(brand)
  const program = createCliProgram(brand)
  await program.parseAsync(argv)
}

export async function resolveGlobalOptsForBrand(
  brand: CliBrand,
  raw: ProgramOpts,
): Promise<GlobalOpts> {
  configureCliBrand(brand)
  const workdir = await resolveWorkdir(raw.workdir)
  const dir = resolve(workdir, raw.dir ?? 'skills')
  const cfg = await readGlobalConfig()
  const requestedEnv =
    brand.id === 'yclawhub'
      ? raw.env?.trim() || readBrandEnv('ENV') || getActiveEnvironmentName(cfg) || undefined
      : undefined

  const environments = cfg?.envs ?? []
  const selectedEnv = requestedEnv
    ? environments.find((entry) => entry.name === requestedEnv) ?? null
    : null

  const site = raw.site ?? selectedEnv?.site ?? readBrandEnv('SITE') ?? brand.defaultSite
  const registrySource = raw.registry
    ? 'cli'
    : selectedEnv?.registry
      ? 'active'
      : readBrandEnv('REGISTRY')
        ? 'env'
        : 'default'
  const registry =
    raw.registry ?? selectedEnv?.registry ?? readBrandEnv('REGISTRY') ?? brand.defaultRegistry
  const authBase = raw.authBase ?? selectedEnv?.authBase ?? readBrandEnv('AUTH_BASE')

  return { workdir, dir, site, registry, registrySource, envName: requestedEnv, authBase }
}

async function resolveWorkdir(explicit?: string) {
  if (explicit?.trim()) return resolve(explicit.trim())
  const envWorkdir = readBrandEnv('WORKDIR')
  if (envWorkdir) return resolve(envWorkdir)

  const cwd = resolve(process.cwd())
  const hasMarker = await hasBrandMarker(cwd)
  if (hasMarker) return cwd

  const clawdbotWorkspace = await resolveClawdbotDefaultWorkspace()
  return clawdbotWorkspace ? resolve(clawdbotWorkspace) : cwd
}

async function hasBrandMarker(workdir: string) {
  const brand = getCliBrand()
  for (const markerDir of brand.workspaceReadDirs) {
    const lockfile = join(workdir, markerDir, 'lock.json')
    if (await pathExists(lockfile)) return true
    if (await pathExists(join(workdir, markerDir))) return true
  }
  return false
}

async function pathExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
