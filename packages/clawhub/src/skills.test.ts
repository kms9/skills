/* @vitest-environment node */
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { CLAWHUB_BRAND, YCLAWHUB_BRAND, configureCliBrand } from './runtime'
import type { SkillOrigin } from './skills'
import {
  buildSkillFingerprint,
  extractZipToDir,
  hashSkillFiles,
  hashSkillZip,
  listTextFiles,
  readLockfile,
  readSkillOrigin,
  sha256Hex,
  writeLockfile,
  writeSkillOrigin,
} from './skills'

afterEach(() => {
  configureCliBrand(CLAWHUB_BRAND)
})

describe('skills', () => {
  it('extracts zip into directory and skips traversal', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'clawhub-zip-'))
    const dir = join(parent, 'dir')
    await mkdir(dir)
    const evilName = `evil-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
    const zip = zipSync({
      'SKILL.md': strToU8('hello'),
      [`../${evilName}`]: strToU8('nope'),
    })
    await extractZipToDir(new Uint8Array(zip), dir)

    expect((await readFile(join(dir, 'SKILL.md'), 'utf8')).trim()).toBe('hello')
    await expect(stat(join(parent, evilName))).rejects.toBeTruthy()
  })

  it('writes yclawhub metadata into .yclawhub without overwriting clawhub state', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'yclawhub-work-'))

    configureCliBrand(CLAWHUB_BRAND)
    await writeLockfile(workdir, {
      version: 1,
      skills: { public: { version: '1.0.0', installedAt: 1 } },
    })

    configureCliBrand(YCLAWHUB_BRAND)
    await writeLockfile(workdir, {
      version: 1,
      skills: { private: { version: '2.0.0', installedAt: 2 } },
    })

    const clawhubLock = JSON.parse(await readFile(join(workdir, '.clawhub', 'lock.json'), 'utf8'))
    const yclawhubLock = JSON.parse(await readFile(join(workdir, '.yclawhub', 'lock.json'), 'utf8'))

    expect(clawhubLock.skills.public.version).toBe('1.0.0')
    expect(yclawhubLock.skills.private.version).toBe('2.0.0')
  })

  it('does not let yclawhub read clawhub origin metadata', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'yclawhub-origin-'))
    await mkdir(join(workdir, '.clawhub'), { recursive: true })
    await writeFile(
      join(workdir, '.clawhub', 'origin.json'),
      JSON.stringify({
        version: 1,
        registry: 'https://example.com',
        slug: 'legacy',
        installedVersion: '1.0.0',
        installedAt: 1,
      }),
      'utf8',
    )

    configureCliBrand(YCLAWHUB_BRAND)
    await expect(readSkillOrigin(workdir)).resolves.toBeNull()
  })

  it('writes and reads lockfile', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'clawhub-work-'))
    await writeLockfile(workdir, {
      version: 1,
      skills: { demo: { version: '1.0.0', installedAt: 1 } },
    })
    const read = await readLockfile(workdir)
    expect(read.skills.demo?.version).toBe('1.0.0')
  })

  it('returns empty lockfile on invalid json', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'clawhub-work-bad-'))
    await mkdir(join(workdir, '.clawhub'), { recursive: true })
    await writeFile(join(workdir, '.clawhub', 'lock.json'), '{', 'utf8')
    const read = await readLockfile(workdir)
    expect(read).toEqual({ version: 1, skills: {} })
  })

  it('returns empty lockfile on schema mismatch', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'clawhub-work-schema-'))
    await mkdir(join(workdir, '.clawhub'), { recursive: true })
    await writeFile(
      join(workdir, '.clawhub', 'lock.json'),
      JSON.stringify({ version: 1, skills: 'nope' }),
      'utf8',
    )
    const read = await readLockfile(workdir)
    expect(read).toEqual({ version: 1, skills: {} })
  })

  it('skips dotfiles and node_modules when listing text files', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'clawhub-files-'))
    await writeFile(join(workdir, 'SKILL.md'), 'hi', 'utf8')
    await writeFile(join(workdir, '.secret.txt'), 'no', 'utf8')
    await mkdir(join(workdir, 'node_modules'), { recursive: true })
    await writeFile(join(workdir, 'node_modules', 'a.txt'), 'no', 'utf8')
    const files = await listTextFiles(workdir)
    expect(files.map((file) => file.relPath)).toEqual(['SKILL.md'])
  })

  it('respects .gitignore and .clawhubignore', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'clawhub-ignore-'))
    await writeFile(join(workdir, '.gitignore'), 'ignored.md\n', 'utf8')
    await writeFile(join(workdir, '.clawhubignore'), 'private.md\n', 'utf8')
    await writeFile(join(workdir, 'SKILL.md'), 'hi', 'utf8')
    await writeFile(join(workdir, 'ignored.md'), 'no', 'utf8')
    await writeFile(join(workdir, 'private.md'), 'no', 'utf8')
    await writeFile(join(workdir, 'public.json'), '{}', 'utf8')

    const files = await listTextFiles(workdir)
    const paths = files.map((file) => file.relPath).sort()
    expect(paths).toEqual(['SKILL.md', 'public.json'])
    expect(files.find((file) => file.relPath === 'SKILL.md')?.contentType).toMatch(/^text\//)
    expect(files.find((file) => file.relPath === 'public.json')?.contentType).toBe(
      'application/json',
    )
  })

  it('yclawhub only respects .yclawhubignore', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'yclawhub-ignore-'))
    await writeFile(join(workdir, '.clawhubignore'), 'legacy.md\n', 'utf8')
    await writeFile(join(workdir, '.yclawhubignore'), 'private.md\n', 'utf8')
    await writeFile(join(workdir, 'SKILL.md'), 'hi', 'utf8')
    await writeFile(join(workdir, 'legacy.md'), 'keep', 'utf8')
    await writeFile(join(workdir, 'private.md'), 'hide', 'utf8')

    configureCliBrand(YCLAWHUB_BRAND)
    const files = await listTextFiles(workdir)
    const paths = files.map((file) => file.relPath).sort()

    expect(paths).toEqual(['SKILL.md', 'legacy.md'])
  })

  it('falls back to text/plain for unknown text extensions', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'clawhub-env-'))
    await writeFile(join(workdir, 'SKILL.md'), 'hi', 'utf8')
    await writeFile(join(workdir, 'config.env'), 'TOKEN=demo', 'utf8')
    const files = await listTextFiles(workdir)
    expect(files.find((file) => file.relPath === 'config.env')?.contentType).toBe('text/plain')
  })

  it('hashes skill files deterministically', async () => {
    const { fingerprint } = hashSkillFiles([
      { relPath: 'b.txt', bytes: strToU8('b') },
      { relPath: 'a.txt', bytes: strToU8('a') },
    ])
    const expected = buildSkillFingerprint([
      { path: 'a.txt', sha256: sha256Hex(strToU8('a')) },
      { path: 'b.txt', sha256: sha256Hex(strToU8('b')) },
    ])
    expect(fingerprint).toBe(expected)
  })

  it('hashes text files inside a downloaded zip deterministically', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('hello'),
      'notes.md': strToU8('world'),
      'image.png': strToU8('nope'),
    })
    const { fingerprint } = hashSkillZip(new Uint8Array(zip))
    const expected = buildSkillFingerprint([
      { path: 'SKILL.md', sha256: sha256Hex(strToU8('hello')) },
      { path: 'notes.md', sha256: sha256Hex(strToU8('world')) },
    ])
    expect(fingerprint).toBe(expected)
  })

  it('ignores unsafe or non-text entries when hashing zips', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('hello'),
      'folder/': strToU8(''),
      '../evil.txt': strToU8('nope'),
      'bad\\path.txt': strToU8('nope'),
      'image.png': strToU8('nope'),
    })
    const { files } = hashSkillZip(new Uint8Array(zip))
    expect(files).toEqual([{ path: 'SKILL.md', sha256: sha256Hex(strToU8('hello')), size: 5 }])
  })

  it('builds fingerprints from valid entries only', () => {
    const fingerprint = buildSkillFingerprint([
      { path: '', sha256: '' },
      { path: 'valid.txt', sha256: sha256Hex(strToU8('ok')) },
    ])
    const expected = buildSkillFingerprint([
      { path: 'valid.txt', sha256: sha256Hex(strToU8('ok')) },
    ])
    expect(fingerprint).toBe(expected)
  })

  it('returns null for invalid skill origin metadata', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'clawhub-origin-'))
    expect(await readSkillOrigin(workdir)).toBeNull()

    await mkdir(join(workdir, '.clawhub'), { recursive: true })
    await writeFile(
      join(workdir, '.clawhub', 'origin.json'),
      JSON.stringify({ version: 2 }),
      'utf8',
    )
    expect(await readSkillOrigin(workdir)).toBeNull()

    await writeFile(
      join(workdir, '.clawhub', 'origin.json'),
      JSON.stringify({ version: 1, registry: 'demo', slug: 'x', installedAt: 1 }),
      'utf8',
    )
    expect(await readSkillOrigin(workdir)).toBeNull()

    await writeFile(
      join(workdir, '.clawhub', 'origin.json'),
      JSON.stringify({
        version: 1,
        registry: 'demo',
        slug: 'x',
        installedVersion: '0.1.0',
        installedAt: 'nope',
      }),
      'utf8',
    )
    expect(await readSkillOrigin(workdir)).toBeNull()

    const origin: SkillOrigin = {
      version: 1,
      registry: 'https://example.com',
      slug: 'demo',
      installedVersion: '1.2.3',
      installedAt: 123,
    }
    await writeSkillOrigin(workdir, origin)
    expect(await readSkillOrigin(workdir)).toEqual(origin)
  })
})
