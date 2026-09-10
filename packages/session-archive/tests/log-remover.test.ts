import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentTeardown } from '../src/host/agent-teardown.js'
import { ArchiveWriter } from '../src/host/archive-writer.js'
import { LogRemover } from '../src/host/log-remover.js'
import type { PersistenceLike } from '../src/host/internals/jsonl-backend.js'
import type { WorkspaceRegistryLike } from '../src/host/internals/workspace-state.js'

const logger = { info: () => {}, warn: () => {} }

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'session-archive-'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Materialize `<root>/<project>/<sessionId>/session.v3.jsonl`. */
async function seedLog(project: string, sessionId: string): Promise<string> {
  const dir = join(root, project, sessionId)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'session.v3.jsonl'), '{"type":"session/created"}\n')
  return dir
}

interface Harness {
  readonly remover: LogRemover
  readonly archived: Set<string>
  readonly detached: string[]
}

function harness(options: {
  archived: string[]
  persistence: Partial<PersistenceLike>
  sessionRoot?: string | undefined
  workspaceSessions?: Record<string, string[]>
}): Harness {
  const archived = new Set(options.archived)
  const detached: string[] = []
  const state = { workspaceIds: ['w1'], archivedSessionIds: [...archived] }

  const registry: WorkspaceRegistryLike = {
    get archivedSessionIds() {
      return [...archived]
    },
    archiveSession: async () => {},
    list: () =>
      Object.entries(options.workspaceSessions ?? {}).map(([id, sessionIds]) => ({
        id,
        title: id,
        path: `/repos/${id}`,
        sessionIds,
        detachSession: async (sessionId: string) => {
          detached.push(`${id}:${sessionId}`)
        },
      })),
  }
  Object.assign(registry, {
    enqueueOperation: <T>(operation: () => Promise<T>) => operation(),
    state,
  })

  const storageDomain = {
    get: () => ({
      global: {
        get: () => ({ ...state, archivedSessionIds: [...archived] }),
        set: async (next: { archivedSessionIds: string[] }) => {
          archived.clear()
          for (const id of next.archivedSessionIds) archived.add(id)
        },
      },
    }),
  }

  const persistence = {
    name: 'session-persistence-jsonl',
    list: async () => [],
    stat: async () => undefined,
    open: async () => ({ close: async () => {} }),
    resolveCurrentLog: async () => undefined,
    ...options.persistence,
  } as unknown as PersistenceLike

  const archive = new ArchiveWriter({ registry, storageDomain: storageDomain as never })
  const teardown = new AgentTeardown({ registry: { values: () => [] }, agents: { get: () => undefined, list: () => [] } })
  const remover = new LogRemover({
    persistence,
    registry,
    teardown,
    archive,
    sessionRoot: options.sessionRoot,
    logger,
  })
  return { remover, archived, detached }
}

describe('LogRemover.remove', () => {
  it('removes the directory the backend named and clears the bookkeeping', async () => {
    const dir = await seedLog('proj', 's1')
    const { remover, archived, detached } = harness({
      archived: ['s1'],
      persistence: { resolveCurrentLog: async () => join(dir, 'session.v3.jsonl') },
      sessionRoot: root,
      workspaceSessions: { w1: ['s1'] },
    })

    const [outcome] = await remover.remove(['s1'])
    expect(outcome).toEqual({ id: 's1', ok: true })
    expect(existsSync(dir)).toBe(false)
    expect(archived.has('s1')).toBe(false)
    expect(detached).toEqual(['w1:s1'])
  })

  it('refuses a session that is not in the archive set', async () => {
    const dir = await seedLog('proj', 's1')
    const { remover } = harness({
      archived: [],
      persistence: { resolveCurrentLog: async () => join(dir, 'session.v3.jsonl') },
      sessionRoot: root,
    })
    expect(await remover.remove(['s1'])).toMatchObject([{ id: 's1', ok: false, code: 'not-archived' }])
    expect(existsSync(dir)).toBe(true)
  })

  it('refuses an invalid session id before touching the filesystem', async () => {
    const resolveCurrentLog = vi.fn(async () => undefined)
    const { remover } = harness({ archived: ['../etc'], persistence: { resolveCurrentLog }, sessionRoot: root })
    expect(await remover.remove(['../etc'])).toMatchObject([{ ok: false, code: 'invalid-session-id' }])
    expect(resolveCurrentLog).not.toHaveBeenCalled()
  })

  it('refuses when the write lease is still held', async () => {
    const dir = await seedLog('proj', 's1')
    const { remover, archived } = harness({
      archived: ['s1'],
      persistence: {
        resolveCurrentLog: async () => join(dir, 'session.v3.jsonl'),
        open: async () => {
          const error = new Error('session "s1" is already owned by an active write handle')
          error.name = 'SessionAlreadyOwnedError'
          throw error
        },
      },
      sessionRoot: root,
    })
    expect(await remover.remove(['s1'])).toMatchObject([{ ok: false, code: 'write-lease-held' }])
    expect(existsSync(dir)).toBe(true)
    expect(archived.has('s1')).toBe(true)
  })

  it('closes the lease probe handle instead of becoming the owner', async () => {
    const dir = await seedLog('proj', 's1')
    const close = vi.fn(async () => {})
    const { remover } = harness({
      archived: ['s1'],
      persistence: { resolveCurrentLog: async () => join(dir, 'session.v3.jsonl'), open: async () => ({ close }) },
      sessionRoot: root,
    })
    await remover.remove(['s1'])
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('refuses a directory outside the configured root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'elsewhere-'))
    await mkdir(join(outside, 's1'), { recursive: true })
    const { remover } = harness({
      archived: ['s1'],
      persistence: { resolveCurrentLog: async () => join(outside, 's1', 'session.v3.jsonl') },
      sessionRoot: root,
    })
    expect(await remover.remove(['s1'])).toMatchObject([{ ok: false, code: 'log-path-refused' }])
    expect(existsSync(join(outside, 's1'))).toBe(true)
  })

  it('refuses a filesystem root even with no configured root', async () => {
    const { remover } = harness({
      archived: ['s1'],
      persistence: { resolveCurrentLog: async () => 'C:\\session.v3.jsonl' },
    })
    const [outcome] = await remover.remove(['s1'])
    expect(outcome).toMatchObject({ ok: false, code: 'log-path-refused' })
  })

  it('reports a legacy generation as its own refusal, never as "nothing to delete"', async () => {
    const { remover, archived } = harness({
      archived: ['s1'],
      persistence: {
        resolveCurrentLog: async () => undefined,
        stat: async () => ({ header: { id: 's1', createdAt: 1, isSeeded: false }, revision: 1 }),
      },
    })
    expect(await remover.remove(['s1'])).toMatchObject([{ ok: false, code: 'legacy-log-format' }])
    expect(archived.has('s1')).toBe(true)
  })

  it('uses the configured root to find a legacy generation the backend will not name', async () => {
    const dir = await seedLog('proj', 's1')
    const { remover, archived } = harness({
      archived: ['s1'],
      persistence: {
        resolveCurrentLog: async () => undefined,
        stat: async () => ({ header: { id: 's1', createdAt: 1, isSeeded: false }, revision: 1 }),
      },
      sessionRoot: root,
    })
    expect(await remover.remove(['s1'])).toEqual([{ id: 's1', ok: true }])
    expect(existsSync(dir)).toBe(false)
    expect(archived.has('s1')).toBe(false)
  })

  it('never resolves a session id onto a directory that merely starts with it', async () => {
    await seedLog('proj', 'abcdef')
    const { remover } = harness({
      archived: ['abc'],
      persistence: {
        resolveCurrentLog: async () => undefined,
        stat: async () => ({ header: { id: 'abc', createdAt: 1, isSeeded: false }, revision: 1 }),
      },
      sessionRoot: root,
    })
    expect(await remover.remove(['abc'])).toMatchObject([{ ok: false, code: 'legacy-log-format' }])
    expect(await readdir(join(root, 'proj'))).toEqual(['abcdef'])
  })

  it('ignores a look-alike directory that holds no generation file', async () => {
    await mkdir(join(root, 'proj', 's1'), { recursive: true })
    const { remover } = harness({
      archived: ['s1'],
      persistence: {
        resolveCurrentLog: async () => undefined,
        stat: async () => ({ header: { id: 's1', createdAt: 1, isSeeded: false }, revision: 1 }),
      },
      sessionRoot: root,
    })
    expect(await remover.remove(['s1'])).toMatchObject([{ ok: false, code: 'legacy-log-format' }])
    expect(existsSync(join(root, 'proj', 's1'))).toBe(true)
  })

  it('still clears the bookkeeping for a session that was never materialized', async () => {
    const { remover, archived, detached } = harness({
      archived: ['s1'],
      persistence: { resolveCurrentLog: async () => undefined, stat: async () => undefined },
      sessionRoot: root,
      workspaceSessions: { w1: ['s1'] },
    })
    expect(await remover.remove(['s1'])).toEqual([{ id: 's1', ok: true }])
    expect(archived.has('s1')).toBe(false)
    expect(detached).toEqual(['w1:s1'])
  })

  it('deletes a generation this build cannot read, using the path in the refusal', async () => {
    const dir = await seedLog('proj', 's1')
    const { remover } = harness({
      archived: ['s1'],
      persistence: {
        resolveCurrentLog: async () => {
          const error = new Error('session format v9 is not supported')
          error.name = 'SessionFormatUnsupportedError'
          Object.assign(error, { location: { path: join(dir, 'session.v9.jsonl') } })
          throw error
        },
      },
      sessionRoot: root,
    })
    expect(await remover.remove(['s1'])).toEqual([{ id: 's1', ok: true }])
    expect(existsSync(dir)).toBe(false)
  })

  it('surfaces an unexpected backend failure without deleting anything', async () => {
    const { remover, archived } = harness({
      archived: ['s1'],
      persistence: {
        resolveCurrentLog: async () => {
          throw new Error('backend exploded')
        },
      },
      sessionRoot: root,
    })
    expect(await remover.remove(['s1'])).toMatchObject([{ ok: false, code: 'host-error' }])
    expect(archived.has('s1')).toBe(true)
  })

  it('keeps going after one session refuses', async () => {
    const dir = await seedLog('proj', 'good')
    const { remover } = harness({
      archived: ['good'],
      persistence: { resolveCurrentLog: async () => join(dir, 'session.v3.jsonl') },
      sessionRoot: root,
    })
    const outcomes = await remover.remove(['not-archived', 'good'])
    expect(outcomes[0]).toMatchObject({ ok: false, code: 'not-archived' })
    expect(outcomes[1]).toEqual({ id: 'good', ok: true })
  })
})
