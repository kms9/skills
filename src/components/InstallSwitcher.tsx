import { useMemo, useState } from 'react'
import { InstallCommandShell } from './InstallCommandShell'
import { buildNpmInstallCommand } from '../lib/install-command'

type PackageManager = 'npm' | 'pnpm' | 'bun'

type InstallSwitcherProps = {
  exampleSlug?: string
}

const PACKAGE_MANAGERS: Array<{ id: PackageManager; label: string }> = [
  { id: 'npm', label: 'npm' },
  // { id: 'pnpm', label: 'pnpm' },
  //  { id: 'bun', label: 'bun' },
]

export function InstallSwitcher({ exampleSlug = 'daily-repot' }: InstallSwitcherProps) {
  const [pm, setPm] = useState<PackageManager>('npm')

  const command = useMemo(() => {
    switch (pm) {
      case 'npm':
        return buildNpmInstallCommand(exampleSlug)
      // case 'pnpm':
      //   return `pnpm dlx clawhub@latest install ${exampleSlug}`
      // case 'bun':
      //   return `bunx clawhub@latest install ${exampleSlug}`
    }
  }, [exampleSlug, pm])

  return (
    <div className="install-switcher">
      <div className="install-switcher-row">
        <div className="stat">Install any skill folder in one shot:</div>
        <div className="install-switcher-toggle" role="tablist" aria-label="Install command">
          {PACKAGE_MANAGERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={
                pm === entry.id ? 'install-switcher-pill is-active' : 'install-switcher-pill'
              }
              role="tab"
              aria-selected={pm === entry.id}
              onClick={() => setPm(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <InstallCommandShell command={command} />
    </div>
  )
}
