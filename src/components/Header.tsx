import { Link } from '@tanstack/react-router'
import { Menu, Monitor, Moon, Sun } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { commonCopy } from '../copy/common'
import { navigationCopy } from '../copy/navigation'
import { gravatarUrl } from '../lib/gravatar'
import { getClawHubSiteUrl, getSiteMode, getSiteName } from '../lib/site'
import { formatUserStatus } from '../lib/user-status'
import { applyTheme, useThemeMode } from '../lib/theme'
import { startThemeTransition } from '../lib/theme-transition'
import { useAuthStatus } from '../lib/useAuthStatus'
import { authRequest } from '../lib/apiClient'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

const useAuthActions = () => {
  const queryClient = useQueryClient()
  return {
    signIn: () => {
      window.location.href = '/auth/login'
    },
    signOut: async () => {
      try {
        await authRequest('/auth/logout', {})
      } catch {
        // ignore
      }
      queryClient.removeQueries({ queryKey: ['auth', 'me'] })
      window.location.href = '/'
    },
  }
}

export default function Header() {
  const common = commonCopy
  const nav = navigationCopy
  const { isAuthenticated, isLoading, me } = useAuthStatus()
  const { signIn, signOut } = useAuthActions()
  const { mode, setMode } = useThemeMode()
  const toggleRef = useRef<HTMLDivElement | null>(null)
  const siteMode = getSiteMode()
  const siteName = useMemo(() => getSiteName(siteMode), [siteMode])
  const isSoulMode = siteMode === 'souls'
  const clawHubUrl = getClawHubSiteUrl()

  const avatar = me?.image ?? (me?.email ? gravatarUrl(me.email) : undefined)
  const handle = me?.handle ?? me?.displayName ?? 'user'
  const visibleName = me?.displayName ?? me?.name ?? handle
  const statusLabel = formatUserStatus(me?.status)
  const visibleSubline = me?.email ?? (me?.handle ? `@${me.handle}` : null)
  const initial = visibleName.charAt(0).toUpperCase()
  const isSuperuser = me?.isSuperuser === true

  const setTheme = (next: 'system' | 'light' | 'dark') => {
    startThemeTransition({
      nextTheme: next,
      currentTheme: mode,
      setTheme: (value) => {
        const nextMode = value as 'system' | 'light' | 'dark'
        applyTheme(nextMode)
        setMode(nextMode)
      },
      context: { element: toggleRef.current },
    })
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link
          to="/"
          search={{ q: undefined, highlighted: undefined, search: undefined }}
          className="brand"
        >
          <span className="brand-mark">
            <img src="/clawd-logo.png" alt="" aria-hidden="true" />
          </span>
          <span className="brand-name">{siteName}</span>
        </Link>
        <nav className="nav-links">
          {isSoulMode ? <a href={clawHubUrl}>{nav.links.clawHub}</a> : null}
          {isSoulMode ? (
            <Link
              to="/souls"
              search={{
                q: undefined,
                sort: undefined,
                dir: undefined,
                view: undefined,
                focus: undefined,
              }}
            >
              {nav.links.souls}
            </Link>
          ) : (
            <Link
              to="/skills"
              search={{
                q: undefined,
                sort: undefined,
                dir: undefined,
                highlighted: undefined,
                nonSuspicious: undefined,
                view: undefined,
                focus: undefined,
              }}
            >
              {nav.links.skills}
            </Link>
          )}
          <Link to="/upload" search={{ updateSlug: undefined }}>
            {common.actions.upload}
          </Link>
          {me ? <Link to="/my/skills">{nav.links.mySkills}</Link> : null}
          {isSoulMode ? null : <Link to="/import">{common.actions.import}</Link>}
          <Link
            to={isSoulMode ? '/souls' : '/skills'}
            search={
              isSoulMode
                ? {
                    q: undefined,
                    sort: undefined,
                    dir: undefined,
                    view: undefined,
                    focus: 'search',
                  }
                : {
                    q: undefined,
                    sort: undefined,
                    dir: undefined,
                    highlighted: undefined,
                    nonSuspicious: undefined,
                    view: undefined,
                    focus: 'search',
                  }
            }
          >
            {nav.links.search}
          </Link>
          {/* Phase 1: Stars feature coming in Phase 2 */}
          {me ? <Link to="/stars" className="nav-disabled">{nav.links.stars}</Link> : null}
          {isSuperuser ? <Link to="/management">{nav.links.management}</Link> : null}
        </nav>
        <div className="nav-actions">
          <div className="nav-mobile">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="nav-mobile-trigger" type="button" aria-label={common.theme.openMenu}>
                  <Menu className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isSoulMode ? (
                  <DropdownMenuItem asChild>
                    <a href={clawHubUrl}>{nav.links.clawHub}</a>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  {isSoulMode ? (
                    <Link
                      to="/souls"
                      search={{
                        q: undefined,
                        sort: undefined,
                        dir: undefined,
                        view: undefined,
                        focus: undefined,
                      }}
                    >
                      {nav.links.souls}
                    </Link>
                  ) : (
                    <Link
                      to="/skills"
                      search={{
                        q: undefined,
                        sort: undefined,
                        dir: undefined,
                        highlighted: undefined,
                        nonSuspicious: undefined,
                        view: undefined,
                        focus: undefined,
                      }}
                    >
                      {nav.links.skills}
                    </Link>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/upload" search={{ updateSlug: undefined }}>
                    {common.actions.upload}
                  </Link>
                </DropdownMenuItem>
                {me ? (
                  <DropdownMenuItem asChild>
                    <Link to="/my/skills">{nav.links.mySkills}</Link>
                  </DropdownMenuItem>
                ) : null}
                {isSoulMode ? null : (
                  <DropdownMenuItem asChild>
                    <Link to="/import">{common.actions.import}</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link
                    to={isSoulMode ? '/souls' : '/skills'}
                    search={
                      isSoulMode
                        ? {
                            q: undefined,
                            sort: undefined,
                            dir: undefined,
                            view: undefined,
                            focus: 'search',
                          }
                        : {
                            q: undefined,
                            sort: undefined,
                            dir: undefined,
                            highlighted: undefined,
                            nonSuspicious: undefined,
                            view: undefined,
                            focus: 'search',
                          }
                    }
                  >
                    {nav.links.search}
                  </Link>
                </DropdownMenuItem>
                {/* Phase 1: Stars feature coming in Phase 2 */}
                {me ? (
                  <DropdownMenuItem asChild className="nav-disabled">
                    <Link to="/stars">{nav.links.stars}</Link>
                  </DropdownMenuItem>
                ) : null}
                {isSuperuser ? (
                  <DropdownMenuItem asChild>
                    <Link to="/management">{nav.links.management}</Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme('system')}>
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                  {common.theme.system}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('light')}>
                  <Sun className="h-4 w-4" aria-hidden="true" />
                  {common.theme.light}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>
                  <Moon className="h-4 w-4" aria-hidden="true" />
                  {common.theme.dark}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="theme-toggle" ref={toggleRef}>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(value) => {
                if (!value) return
                setTheme(value as 'system' | 'light' | 'dark')
              }}
              aria-label={common.theme.mode}
            >
              <ToggleGroupItem value="system" aria-label={common.theme.systemTheme}>
                <Monitor className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{common.theme.system}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="light" aria-label={common.theme.lightTheme}>
                <Sun className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{common.theme.light}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" aria-label={common.theme.darkTheme}>
                <Moon className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{common.theme.dark}</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {/* Phase 1: Authentication UI simplified */}
          {isAuthenticated && me ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="user-trigger" type="button">
                  {avatar ? (
                    <img src={avatar} alt={me.displayName ?? me.name ?? common.user.avatarAlt} />
                  ) : (
                    <span className="user-menu-fallback">{initial}</span>
                  )}
                  <span className="user-trigger-copy">
                    <span className="user-trigger-name">{visibleName}</span>
                    {visibleSubline ? (
                      <span className="user-trigger-subline">{visibleSubline}</span>
                    ) : null}
                    <span className="user-trigger-subline">状态：{statusLabel}</span>
                  </span>
                  <span className="user-menu-chevron">▾</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild className="nav-disabled">
                  <Link to="/dashboard">{common.actions.dashboard}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/my/skills">{nav.links.mySkills}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">{common.actions.settings}</Link>
                </DropdownMenuItem>
                {isSuperuser ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/management">{nav.links.management}</Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>{common.actions.signOut}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              disabled={isLoading}
              onClick={() => void signIn()}
            >
              <span className="sign-in-label">{common.actions.signIn}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
