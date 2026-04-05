/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SkillHeader } from '../components/SkillHeader'
import { buildNpmInstallCommand } from '../lib/install-command'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}))

describe('SkillHeader', () => {
  it('shows only cumulative installs', () => {
    render(
      <SkillHeader
        skill={{
          _id: 'skill:daily-paper',
          _creationTime: 1,
          slug: 'daily-paper',
          displayName: 'Daily Paper',
          summary: 'summary',
          ownerUserId: 'unknown',
          tags: ['latest'],
          highlighted: true,
          stats: { downloads: 12, installs: 3, versions: 1, stars: 0 },
          createdAt: 1,
          updatedAt: 1,
        }}
        owner={null}
        ownerHandle={null}
        latestVersion={null}
        modInfo={null}
        canManage={false}
        isAuthenticated={false}
        isStaff={false}
        isStarred={false}
        onToggleStar={() => {}}
        onOpenReport={() => {}}
        forkOf={null}
        forkOfLabel="fork of"
        forkOfHref={null}
        forkOfOwnerHandle={null}
        canonical={null}
        canonicalHref={null}
        canonicalOwnerHandle={null}
        staffModerationNote={null}
        staffVisibilityTag={null}
        isAutoHidden={false}
        isRemoved={false}
        nixPlugin={undefined}
        hasPluginBundle={false}
        configRequirements={undefined}
        cliHelp={undefined}
        tagEntries={[]}
        versionById={new Map()}
        tagName="latest"
        onTagNameChange={() => {}}
        tagVersionId=""
        onTagVersionChange={() => {}}
        onTagSubmit={() => {}}
        tagVersions={[]}
        clawdis={undefined}
        osLabels={[]}
      />,
    )

    expect(screen.getByText(/累计安装/)).toBeTruthy()
    expect(screen.queryByText(/当前安装/)).toBeNull()
  })

  it('shows quick install command for the current skill slug', () => {
    render(
      <SkillHeader
        skill={{
          _id: 'skill:daily-paper',
          _creationTime: 1,
          slug: 'daily-paper',
          displayName: 'Daily Paper',
          summary: 'summary',
          ownerUserId: 'unknown',
          tags: ['latest'],
          highlighted: true,
          stats: { downloads: 12, installs: 3, versions: 1, stars: 0 },
          createdAt: 1,
          updatedAt: 1,
        }}
        owner={null}
        ownerHandle={null}
        latestVersion={{ version: '1.0.0', createdAt: 1, changelog: '' }}
        modInfo={null}
        canManage={false}
        isAuthenticated={false}
        isStaff={false}
        isStarred={false}
        onToggleStar={() => {}}
        onOpenReport={() => {}}
        forkOf={null}
        forkOfLabel="fork of"
        forkOfHref={null}
        forkOfOwnerHandle={null}
        canonical={null}
        canonicalHref={null}
        canonicalOwnerHandle={null}
        staffModerationNote={null}
        staffVisibilityTag={null}
        isAutoHidden={false}
        isRemoved={false}
        nixPlugin={undefined}
        hasPluginBundle={false}
        configRequirements={undefined}
        cliHelp={undefined}
        tagEntries={[]}
        versionById={new Map()}
        tagName="latest"
        onTagNameChange={() => {}}
        tagVersionId=""
        onTagVersionChange={() => {}}
        onTagSubmit={() => {}}
        tagVersions={[]}
        clawdis={undefined}
        osLabels={[]}
      />,
    )

    expect(screen.getByText('快捷安装')).toBeTruthy()
    expect(screen.getByText(buildNpmInstallCommand('daily-paper'))).toBeTruthy()
    expect(screen.getByRole('button', { name: '复制快捷安装命令' })).toBeTruthy()
  })
})
