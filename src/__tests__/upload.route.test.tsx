import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { strToU8, zipSync } from 'fflate'
import { vi } from 'vitest'

import { uploadCopy } from '../copy/upload'
import { Upload } from '../routes/upload'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: unknown }) => config,
  useNavigate: () => vi.fn(),
  useSearch: () => ({ updateSlug: undefined }),
}))

const fetchMock = vi.fn()
const useAuthStatusMock = vi.fn()
const publishMutateMock = vi.fn()

vi.mock('../lib/useAuthStatus', () => ({
  useAuthStatus: () => useAuthStatusMock(),
}))

vi.mock('../hooks/usePublishSkill', () => ({
  usePublishSkill: () => ({
    mutate: publishMutateMock,
  }),
}))

function createJsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText:
      status === 404 ? 'Not Found' : status === 409 ? 'Conflict' : status === 403 ? 'Forbidden' : 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

describe('Upload route', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    useAuthStatusMock.mockReset()
    publishMutateMock.mockReset()
    useAuthStatusMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      me: { _id: 'users:1', id: 'users:1', handle: 'publisher' },
    })
    publishMutateMock.mockImplementation((_input, options) => {
      options?.onSuccess?.({ ok: 'published', skillId: '1', versionId: '1' })
    })
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/skills/')) {
        return createJsonResponse(404, { error: 'skill not found' })
      }
      return createJsonResponse(200, { storageId: 'storage-id' })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows validation issues before submit', async () => {
    render(<Upload />)
    const publishButton = screen.getByRole('button', { name: uploadCopy.actions.publish.replace('{type}', uploadCopy.nouns.skill) })
    expect(publishButton.getAttribute('disabled')).not.toBeNull()
    expect(screen.getByText(uploadCopy.validation.slugRequired)).toBeTruthy()
    expect(screen.getByText(uploadCopy.validation.displayNameRequired)).toBeTruthy()
  })

  it('marks the input for folder uploads', async () => {
    render(<Upload />)
    const input = screen.getByTestId('upload-input')
    await waitFor(() => {
      expect(input.getAttribute('webkitdirectory')).not.toBeNull()
    })
  })

  it('enables publish when fields and files are valid', async () => {
    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Cool Skill' },
    })
    fireEvent.change(screen.getByPlaceholderText('1.0.0'), {
      target: { value: '1.2.3' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })
    const file = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    const publishButton = screen.getByRole('button', { name: uploadCopy.actions.publish.replace('{type}', uploadCopy.nouns.skill) }) as HTMLButtonElement
    expect(await screen.findByText(uploadCopy.validation.allPassed)).toBeTruthy()
    await waitFor(() => {
      expect(publishButton.getAttribute('disabled')).toBeNull()
    })
  })

  it('shows owned-slug guidance and requires a higher version', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/skills/cool-skill')) {
        return createJsonResponse(200, {
          skill: { slug: 'cool-skill', displayName: 'Cool Skill' },
          latestVersion: { version: '1.2.3', createdAt: 1, changelog: '' },
          owner: { handle: 'publisher', displayName: 'Publisher' },
        })
      }
      return createJsonResponse(404, { error: 'skill not found' })
    })

    render(<Upload />)

    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })

    expect(await screen.findByText(uploadCopy.status.slugOwned)).toBeTruthy()
    expect(
      await screen.findByText(uploadCopy.status.latestVersion.replace('{version}', '1.2.3')),
    ).toBeTruthy()
    expect(
      await screen.findByText(
        uploadCopy.validation.versionMustIncrease.replace('{version}', '1.2.3'),
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: uploadCopy.actions.publishVersion })).toBeTruthy()
  })

  it('blocks publishing when the slug belongs to another user', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/skills/cool-skill')) {
        return createJsonResponse(200, {
          skill: { slug: 'cool-skill', displayName: 'Cool Skill' },
          latestVersion: { version: '1.2.3', createdAt: 1, changelog: '' },
          owner: { handle: 'other-user', displayName: 'Other User' },
        })
      }
      return createJsonResponse(404, { error: 'skill not found' })
    })

    render(<Upload />)

    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })

    expect((await screen.findAllByText(uploadCopy.validation.slugTaken)).length).toBeGreaterThan(0)
    const publishButton = screen.getByRole('button', {
      name: uploadCopy.actions.publish.replace('{type}', uploadCopy.nouns.skill),
    }) as HTMLButtonElement
    expect(publishButton.getAttribute('disabled')).not.toBeNull()
  })

  it('autofills slug and display name from SKILL.md frontmatter', async () => {
    render(<Upload />)

    const file = new File(['---\nname: my-demo-skill\n---\nBody'], 'SKILL.md', {
      type: 'text/markdown',
    })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText(
          uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill),
        ) as HTMLInputElement).value,
      ).toBe('my-demo-skill')
    })
    expect(
      (screen.getByPlaceholderText(
        uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill),
      ) as HTMLInputElement).value,
    ).toBe('My Demo Skill')
    expect(
      await screen.findByText(
        uploadCopy.status.autofilledFromSkill.replace('{requiredFile}', 'SKILL.md'),
      ),
    ).toBeTruthy()
  })

  it('does not override manual slug and display name after re-upload', async () => {
    render(<Upload />)

    const slugInput = screen.getByPlaceholderText(
      uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill),
    ) as HTMLInputElement
    const displayNameInput = screen.getByPlaceholderText(
      uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill),
    ) as HTMLInputElement
    fireEvent.change(slugInput, { target: { value: 'manual-slug' } })
    fireEvent.change(displayNameInput, { target: { value: 'Manual Name' } })

    const file = new File(['---\nname: auto-name\n---\nBody'], 'SKILL.md', {
      type: 'text/markdown',
    })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(slugInput.value).toBe('manual-slug')
      expect(displayNameInput.value).toBe('Manual Name')
    })
  })

  it('extracts zip uploads and unwraps top-level folders', async () => {
    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Cool Skill' },
    })
    fireEvent.change(screen.getByPlaceholderText('1.0.0'), {
      target: { value: '1.2.3' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })

    const zip = zipSync({
      'hetzner-cloud-skill/SKILL.md': new Uint8Array(strToU8('hello')),
      'hetzner-cloud-skill/notes.txt': new Uint8Array(strToU8('notes')),
    })
    const zipBytes = Uint8Array.from(zip).buffer
    const zipFile = new File([zipBytes], 'bundle.zip', { type: 'application/zip' })

    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [zipFile] } })

    expect(await screen.findByText('notes.txt', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText('SKILL.md')).toBeTruthy()
    expect(await screen.findByText(uploadCopy.validation.allPassed, {}, { timeout: 3000 })).toBeTruthy()
  })

  it('unwraps folder uploads so SKILL.md can be at the top-level', async () => {
    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'ynab' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'YNAB' },
    })
    fireEvent.change(screen.getByPlaceholderText('1.0.0'), {
      target: { value: '1.0.0' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })

    const file = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'webkitRelativePath', { value: 'ynab/SKILL.md' })

    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('SKILL.md')).toBeTruthy()
    expect(await screen.findByText(uploadCopy.validation.allPassed)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: uploadCopy.actions.publish.replace('{type}', uploadCopy.nouns.skill) }))
    await waitFor(() => {
      expect(screen.getByText(uploadCopy.validation.allPassed)).toBeTruthy()
    })
  })

  it('blocks non-text folder uploads (png)', async () => {
    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Cool Skill' },
    })
    fireEvent.change(screen.getByPlaceholderText('1.0.0'), {
      target: { value: '1.2.3' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })

    const skill = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    const png = new File([new Uint8Array([137, 80, 78, 71]).buffer], 'screenshot.png', {
      type: 'image/png',
    })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [skill, png] } })

    expect(await screen.findByText('screenshot.png')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: uploadCopy.actions.publish.replace('{type}', uploadCopy.nouns.skill) }))
    expect(await screen.findByText(uploadCopy.validation.removeNonText.replace('{names}', 'screenshot.png'))).toBeTruthy()
    expect(screen.getByText('screenshot.png')).toBeTruthy()
  })

  it('removes invalid files from the list and clears the validation error', async () => {
    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Cool Skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })

    const skill = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    const png = new File([new Uint8Array([137, 80, 78, 71]).buffer], 'screenshot.png', {
      type: 'image/png',
    })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [skill, png] } })

    expect(await screen.findByText('screenshot.png')).toBeTruthy()
    expect(await screen.findByText(uploadCopy.validation.removeNonText.replace('{names}', 'screenshot.png'))).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: uploadCopy.actions.removeFile })[1]!)

    await waitFor(() => {
      expect(screen.queryByText('screenshot.png')).toBeNull()
      expect(screen.queryByText(uploadCopy.validation.removeNonText.replace('{names}', 'screenshot.png'))).toBeNull()
    })
  })

  it('disables publish after removing SKILL.md', async () => {
    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Cool Skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })

    const skill = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    const note = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [skill, note] } })

    expect(await screen.findByText(uploadCopy.validation.allPassed)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: uploadCopy.actions.removeFile })[0]!)

    const publishButton = screen.getByRole('button', {
      name: uploadCopy.actions.publish.replace('{type}', uploadCopy.nouns.skill),
    }) as HTMLButtonElement
    await waitFor(() => {
      expect(screen.queryByText('SKILL.md')).toBeNull()
      expect(
        screen.getByText(uploadCopy.validation.requiredFile.replace('{requiredFile}', 'SKILL.md')),
      ).toBeTruthy()
      expect(publishButton.getAttribute('disabled')).not.toBeNull()
    })
  })

  it('returns to empty state after removing the last file', async () => {
    render(<Upload />)
    const skill = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [skill] } })

    expect(await screen.findByText('SKILL.md')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: uploadCopy.actions.removeFile }))

    await waitFor(() => {
      expect(screen.getByText(uploadCopy.dropzone.noFiles)).toBeTruthy()
      expect(screen.getByText(uploadCopy.validation.filesRequired)).toBeTruthy()
    })
  })

  it('shows an informational note when mac junk files are ignored', async () => {
    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Cool Skill' },
    })
    fireEvent.change(screen.getByPlaceholderText('1.0.0'), {
      target: { value: '1.2.3' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })

    const skill = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    const junk = new File(['junk'], '.DS_Store', { type: 'application/octet-stream' })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [skill, junk] } })

    expect(await screen.findByText('SKILL.md')).toBeTruthy()
    expect(screen.queryByText('.DS_Store')).toBeNull()
    expect(await screen.findByText(uploadCopy.dropzone.ignoredMacJunk.replace('{count}', '1').replace('{labels}', '.DS_Store').replace('{suffix}', ''))).toBeTruthy()
    expect(await screen.findByText(uploadCopy.validation.allPassed)).toBeTruthy()
  })

  it('surfaces publish errors and stays on page', async () => {
    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Cool Skill' },
    })
    fireEvent.change(screen.getByPlaceholderText('1.0.0'), {
      target: { value: '1.2.3' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.changelog.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Initial drop.' },
    })
    const file = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    const publishButton = screen.getByRole('button', { name: uploadCopy.actions.publish.replace('{type}', uploadCopy.nouns.skill) }) as HTMLButtonElement
    await screen.findByText(uploadCopy.validation.allPassed)
    fireEvent.click(publishButton)
    expect(await screen.findByText(uploadCopy.validation.allPassed)).toBeTruthy()
  })

  it('translates duplicate-version publish errors into a version guidance message', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/skills/cool-skill')) {
        return createJsonResponse(200, {
          skill: { slug: 'cool-skill', displayName: 'Cool Skill' },
          latestVersion: { version: '1.2.3', createdAt: 1, changelog: '' },
          owner: { handle: 'publisher', displayName: 'Publisher' },
        })
      }
      return createJsonResponse(404, { error: 'skill not found' })
    })
    publishMutateMock.mockImplementationOnce((_input, options) => {
      options?.onError?.({ data: { code: 'version_exists', error: 'version already exists' } })
    })

    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Cool Skill' },
    })
    fireEvent.change(screen.getByPlaceholderText('1.0.0'), {
      target: { value: '1.2.4' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })
    const file = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    const publishButton = await screen.findByRole('button', { name: uploadCopy.actions.publishVersion })
    await waitFor(() => {
      expect((publishButton as HTMLButtonElement).getAttribute('disabled')).toBeNull()
    })
    fireEvent.click(publishButton)

    expect(await screen.findByText(uploadCopy.status.versionExists)).toBeTruthy()
  })

  it('translates owner-conflict publish errors into a slug guidance message', async () => {
    publishMutateMock.mockImplementationOnce((_input, options) => {
      options?.onError?.({
        data: {
          code: 'skill_owned_by_another_user',
          error: 'skill owned by another user',
        },
      })
    })

    render(<Upload />)
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.slug.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'cool-skill' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.displayName.replace('{type}', uploadCopy.nouns.skill)), {
      target: { value: 'Cool Skill' },
    })
    fireEvent.change(screen.getByPlaceholderText('1.0.0'), {
      target: { value: '1.2.3' },
    })
    fireEvent.change(screen.getByPlaceholderText(uploadCopy.placeholders.tags), {
      target: { value: 'latest' },
    })
    const file = new File(['hello'], 'SKILL.md', { type: 'text/markdown' })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    const publishButton = screen.getByRole('button', {
      name: uploadCopy.actions.publish.replace('{type}', uploadCopy.nouns.skill),
    })
    await waitFor(() => {
      expect((publishButton as HTMLButtonElement).getAttribute('disabled')).toBeNull()
    })
    fireEvent.click(publishButton)

    expect(await screen.findByText(uploadCopy.status.ownerConflict)).toBeTruthy()
  })
})
