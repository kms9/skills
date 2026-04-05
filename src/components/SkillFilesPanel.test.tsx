import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillFilesPanel } from './SkillFilesPanel'

const getFileTextMock = vi.fn()

vi.mock('../lib/skillFiles', () => ({
  getSkillFileText: (...args: unknown[]) => getFileTextMock(...args),
}))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))

vi.mock('remark-gfm', () => ({
  default: {},
}))

type SkillFile = {
  path: string
  size: number
  storageId?: string
  sha256?: string
  contentType?: string
}

function makeFile(path: string, size: number): SkillFile {
  return { path, size } as unknown as SkillFile
}

describe('SkillFilesPanel', () => {
  beforeEach(() => {
    getFileTextMock.mockReset()
  })

  it('caches loaded files and avoids duplicate fetches', async () => {
    getFileTextMock.mockResolvedValue({
      text: 'echo hello',
      size: 10,
      sha256: 'a'.repeat(64),
    })

    render(
      <SkillFilesPanel
        slug={'demo'}
        version={'1.0.0'}
        readmeContent={'# skill'}
        readmeError={null}
        latestFiles={[makeFile('scripts/run.sh', 10)]}
      />,
    )

    const fileButton = screen.getByRole('button', { name: /scripts\/run\.sh/i })
    fireEvent.click(fileButton)

    await screen.findByText('echo hello')

    fireEvent.click(fileButton)

    await waitFor(() => {
      expect(getFileTextMock).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores stale responses when newer file selection is active', async () => {
    const resolvers: Record<string, (value: { text: string; size: number; sha256: string }) => void> = {}

    getFileTextMock.mockImplementation(
      ({ path }: { path: string }) =>
        new Promise<{ text: string; size: number; sha256: string }>((resolve) => {
          resolvers[path] = resolve
        }),
    )

    render(
      <SkillFilesPanel
        slug={'demo'}
        version={'1.0.0'}
        readmeContent={'# skill'}
        readmeError={null}
        latestFiles={[makeFile('a.txt', 5), makeFile('b.txt', 6)]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /a\.txt/i }))
    fireEvent.click(screen.getByRole('button', { name: /b\.txt/i }))

    resolvers['a.txt']({ text: 'alpha', size: 5, sha256: 'b'.repeat(64) })
    resolvers['b.txt']({ text: 'beta', size: 6, sha256: 'c'.repeat(64) })

    await screen.findByText('beta')
  })
})
