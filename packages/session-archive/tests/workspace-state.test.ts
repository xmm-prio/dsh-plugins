import { describe, expect, it } from 'vitest'

import {
  probePrivateWritePath,
  readWorkspaceDomainState,
  withoutArchived,
} from '../src/host/internals/workspace-state.js'
import type { WorkspaceRegistryLike } from '../src/host/internals/workspace-state.js'

function facility(global: unknown) {
  return { get: () => ({ global }) as never }
}

describe('readWorkspaceDomainState', () => {
  it('reads a well-formed global record', () => {
    const read = readWorkspaceDomainState(facility({ get: () => ({ workspaceIds: ['w1'], archivedSessionIds: ['a'] }), set: async () => {} }))
    expect(read).toEqual({ ok: true, state: { workspaceIds: ['w1'], archivedSessionIds: ['a'] } })
  })

  it('reports an empty archive set as a successful read, not a failure', () => {
    const read = readWorkspaceDomainState(facility({ get: () => ({ archivedSessionIds: [] }), set: async () => {} }))
    expect(read.ok).toBe(true)
  })

  it('distinguishes a missing storageDomain service', () => {
    expect(readWorkspaceDomainState(undefined)).toEqual({ ok: false, reason: 'domain-facility-unavailable' })
  })

  it('distinguishes a domain that is not open', () => {
    expect(readWorkspaceDomainState({ get: () => undefined })).toEqual({ ok: false, reason: 'domain-not-open' })
  })

  it('treats a handle without a usable global slot as not open', () => {
    expect(readWorkspaceDomainState(facility({ get: 'nope' }))).toEqual({ ok: false, reason: 'domain-not-open' })
    expect(readWorkspaceDomainState(facility({ get: () => ({}) }))).toEqual({ ok: false, reason: 'domain-not-open' })
  })

  it('reports a throwing getter rather than pretending the set is empty', () => {
    const throwing = {
      get: () => {
        throw new Error('closed')
      },
      set: async () => {},
    }
    expect(readWorkspaceDomainState(facility(throwing))).toEqual({ ok: false, reason: 'global-unreadable' })
  })

  it('rejects a global record that is not an object', () => {
    expect(readWorkspaceDomainState(facility({ get: () => null, set: async () => {} }))).toEqual({
      ok: false,
      reason: 'state-malformed',
    })
    expect(readWorkspaceDomainState(facility({ get: () => [], set: async () => {} }))).toEqual({
      ok: false,
      reason: 'state-malformed',
    })
  })

  it('rejects a global record whose archive set is missing or not string ids', () => {
    expect(readWorkspaceDomainState(facility({ get: () => ({ workspaceIds: [] }), set: async () => {} }))).toEqual({
      ok: false,
      reason: 'state-malformed',
    })
    expect(
      readWorkspaceDomainState(facility({ get: () => ({ archivedSessionIds: ['a', 7] }), set: async () => {} })),
    ).toEqual({ ok: false, reason: 'state-malformed' })
  })

  it('reports a throwing facility as a closed domain', () => {
    const angry = {
      get: () => {
        throw new Error('boom')
      },
    }
    expect(readWorkspaceDomainState(angry)).toEqual({ ok: false, reason: 'domain-not-open' })
  })
})

describe('withoutArchived', () => {
  const state = { workspaceIds: ['w1'], archivedSessionIds: ['a', 'b', 'c'] }

  it('replaces the whole object rather than mutating the array', () => {
    const { next } = withoutArchived(state, ['b'])
    expect(next).toEqual({ workspaceIds: ['w1'], archivedSessionIds: ['a', 'c'] })
    expect(state.archivedSessionIds).toEqual(['a', 'b', 'c'])
    expect(next).not.toBe(state)
    expect(next.archivedSessionIds).not.toBe(state.archivedSessionIds)
  })

  it('preserves every unrelated key of the global record', () => {
    const { next } = withoutArchived({ ...state, pendingMutation: { operation: 'create' } }, ['a'])
    expect(next['pendingMutation']).toEqual({ operation: 'create' })
  })

  it('reports which of the requested ids were actually in the set', () => {
    expect(withoutArchived(state, ['b', 'zz']).dropped).toEqual(['b'])
  })

  it('is a no-op for an id that is not archived', () => {
    const { next, dropped } = withoutArchived(state, ['zz'])
    expect(next.archivedSessionIds).toEqual(['a', 'b', 'c'])
    expect(dropped).toEqual([])
  })
})

describe('probePrivateWritePath', () => {
  function registry(extra: Record<string, unknown>): WorkspaceRegistryLike {
    return { archivedSessionIds: [], archiveSession: async () => {}, list: () => [], ...extra } as WorkspaceRegistryLike
  }

  it('accepts a registry carrying both private members', () => {
    expect(
      probePrivateWritePath(registry({ enqueueOperation: () => {}, state: { archivedSessionIds: [] } })),
    ).toEqual({ ok: true })
  })

  it('names the missing prototype method', () => {
    expect(probePrivateWritePath(registry({ state: { archivedSessionIds: [] } }))).toEqual({
      ok: false,
      missing: 'enqueue-operation',
    })
  })

  it('names the missing instance field', () => {
    expect(probePrivateWritePath(registry({ enqueueOperation: () => {} }))).toEqual({
      ok: false,
      missing: 'registry-state',
    })
  })

  it('rejects a state field of the wrong shape', () => {
    expect(probePrivateWritePath(registry({ enqueueOperation: () => {}, state: { archivedSessionIds: 'nope' } }))).toEqual(
      { ok: false, missing: 'registry-state' },
    )
    expect(probePrivateWritePath(registry({ enqueueOperation: () => {}, state: null }))).toEqual({
      ok: false,
      missing: 'registry-state',
    })
  })
})
