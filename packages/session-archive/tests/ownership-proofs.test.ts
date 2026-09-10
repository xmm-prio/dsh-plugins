import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { proveDerivedOwnership, resolveSessionRoot } from '../src/host/internals/jsonl-backend.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ownership-'))
})

/** Materialize `<root>/<project>/<name>`, optionally with a generation file in it. */
async function seed(project: string, name: string, generation?: string): Promise<string> {
  const dir = join(root, project, name)
  await mkdir(dir, { recursive: true })
  if (generation !== undefined) await writeFile(join(dir, generation), '{}\n')
  return dir
}

describe('proveDerivedOwnership', () => {
  it('accepts a directory that satisfies all four proofs', async () => {
    const dir = await seed('proj', 's1', 'session.v3.jsonl')
    expect(await proveDerivedOwnership({ dir, sessionId: 's1', root })).toBeUndefined()
  })

  it('accepts a compressed generation file', async () => {
    const dir = await seed('proj', 's1', 'session.v12.jsonl.zstd')
    expect(await proveDerivedOwnership({ dir, sessionId: 's1', root })).toBeUndefined()
  })

  it('refuses a basename that merely starts with the session id', async () => {
    const dir = await seed('proj', 'abcdef', 'session.v3.jsonl')
    expect(await proveDerivedOwnership({ dir, sessionId: 'abc', root })).toBe('ownership-basename-mismatch')
  })

  it('refuses a basename the session id merely starts with', async () => {
    const dir = await seed('proj', 'abc', 'session.v3.jsonl')
    expect(await proveDerivedOwnership({ dir, sessionId: 'abcdef', root })).toBe('ownership-basename-mismatch')
  })

  it('refuses a session id that could never name a directory', async () => {
    const dir = await seed('proj', 's1', 'session.v3.jsonl')
    expect(await proveDerivedOwnership({ dir, sessionId: '../etc', root })).toBe('ownership-basename-mismatch')
  })

  it('refuses a directory that holds no generation file', async () => {
    const dir = await seed('proj', 's1')
    expect(await proveDerivedOwnership({ dir, sessionId: 's1', root })).toBe('ownership-generation-missing')
  })

  it('refuses a directory whose only contents look nothing like a session log', async () => {
    const dir = await seed('proj', 's1', 'notes.txt')
    expect(await proveDerivedOwnership({ dir, sessionId: 's1', root })).toBe('ownership-generation-missing')
  })

  it('refuses a directory that does not exist', async () => {
    const dir = join(root, 'proj', 's1')
    expect(await proveDerivedOwnership({ dir, sessionId: 's1', root })).toBe('ownership-generation-missing')
  })

  it('refuses a directory outside the session log root', async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), 'elsewhere-'))
    const dir = join(elsewhere, 'proj', 's1')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'session.v3.jsonl'), '{}\n')
    expect(await proveDerivedOwnership({ dir, sessionId: 's1', root })).toBe('ownership-outside-root')
  })

  it('refuses a root that merely shares a name prefix with the directory', async () => {
    const dir = await seed('proj', 's1', 'session.v3.jsonl')
    expect(await proveDerivedOwnership({ dir, sessionId: 's1', root: `${root}-other` })).toBe(
      'ownership-outside-root',
    )
  })

  it('refuses a volume root on either platform', async () => {
    expect(await proveDerivedOwnership({ dir: '/', sessionId: 's1', root: '/' })).toBe('ownership-unsafe-root')
    expect(await proveDerivedOwnership({ dir: 'C:\\', sessionId: 's1', root: 'C:\\' })).toBe('ownership-unsafe-root')
    expect(await proveDerivedOwnership({ dir: '\\\\server\\share', sessionId: 's1', root: '\\\\server\\share' })).toBe(
      'ownership-unsafe-root',
    )
  })

  it('refuses a path too shallow to be a session directory', async () => {
    expect(await proveDerivedOwnership({ dir: '/s1', sessionId: 's1', root: '/' })).toBe('ownership-unsafe-root')
  })

  it('refuses a relative path', async () => {
    expect(await proveDerivedOwnership({ dir: 'proj/s1', sessionId: 's1', root })).toBe('ownership-unsafe-root')
  })

  it('reports the basename mismatch before reading the disk', async () => {
    // Nothing exists at this path, so a generation check would also fail. The
    // basename proof has to be the one that answers, or a refusal would blame
    // the wrong expectation.
    expect(await proveDerivedOwnership({ dir: join(root, 'proj', 'other'), sessionId: 's1', root })).toBe(
      'ownership-basename-mismatch',
    )
  })
})

describe('resolveSessionRoot', () => {
  it('prefers the backend\u2019s own published root', () => {
    expect(resolveSessionRoot({ config: { root: '/logs' } } as never, '/configured')).toEqual({
      known: true,
      path: resolve('/logs'),
      source: 'backend-config',
    })
  })

  it('falls back to the escape hatch when the backend publishes nothing', () => {
    expect(resolveSessionRoot({} as never, '/configured')).toEqual({
      known: true,
      path: resolve('/configured'),
      source: 'plugin-config',
    })
  })

  it('resolves a relative root rather than carrying it into the containment guard', () => {
    const answer = resolveSessionRoot({ config: { root: 'logs' } } as never, undefined)
    expect(answer).toEqual({ known: true, path: resolve('logs'), source: 'backend-config' })
  })

  it('reports the root as unknown, naming the backend, when neither source has one', () => {
    const answer = resolveSessionRoot({ name: 'session-persistence-jsonl' } as never, undefined)
    expect(answer.known).toBe(false)
    expect(answer.known === false && answer.reason).toContain('session-persistence-jsonl')
  })

  it('ignores a root of the wrong type instead of coercing it', () => {
    expect(resolveSessionRoot({ config: { root: 42 } } as never, undefined).known).toBe(false)
  })
})
