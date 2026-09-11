/**
 * How this plugin calls the persistence backend, argument for argument.
 *
 * The backend's cancellation parameter is not stable across DSH versions.
 * `list` took it positionally as `list(signal)` and later took `list({
 * signal })`; inside a single version `resolveCurrentLog(id, signal)` is
 * positional while `stat(id, { signal })` is not. There is no way to tell the
 * shapes apart at runtime, and passing the wrong one does not degrade — an
 * options object reaching the older positional `list` is a truthy non-signal,
 * so the backend's own `signal?.throwIfAborted()` throws "not a function" and
 * the archive area cannot be opened at all.
 *
 * Passing nothing is the one call shape every version accepts. These tests
 * pin that, because it is invisible in the source: a correct call and a fatal
 * one differ by a single argument that looks harmless.
 */

import { describe, expect, it, vi } from 'vitest'

import { locateSessionLog } from '../src/host/internals/jsonl-backend.js'
import { MetadataReader } from '../src/host/metadata-reader.js'

/** Record the exact argument list of every call. */
function recorder<T>(result: T) {
  const calls: unknown[][] = []
  const fn = vi.fn((...args: unknown[]) => {
    calls.push(args)
    return Promise.resolve(result)
  })
  return { fn, calls }
}

describe('the arguments the backend actually receives', () => {
  it('calls list with none at all', async () => {
    const list = recorder([])
    const reader = new MetadataReader({
      persistence: { list: list.fn } as never,
      projectionCache: undefined,
      logger: { warn: vi.fn() },
    })

    await reader.catalog()

    expect(list.calls).toEqual([[]])
  })

  it('calls resolveCurrentLog with the session id and nothing else', async () => {
    const resolve = recorder('/logs/project/session-a/session.v3.jsonl')
    const persistence = { resolveCurrentLog: resolve.fn, stat: vi.fn() }

    await locateSessionLog(persistence as never, 'session-a', { known: true, path: '/logs', source: 'config' } as never)

    expect(resolve.calls).toEqual([['session-a']])
  })

  it('calls stat with the session id and nothing else', async () => {
    // No `resolveCurrentLog` at all: the shape an older backend presents, and
    // the branch that falls through to `stat`.
    const stat = recorder(undefined)
    const persistence = { stat: stat.fn }

    await locateSessionLog(persistence as never, 'session-a', { known: true, path: '/logs', source: 'config' } as never)

    expect(stat.calls).toEqual([['session-a']])
  })

  it('survives a backend whose list only accepts a positional signal', async () => {
    // The exact older implementation, reduced to the line that used to throw.
    // It passes now for the only reason that matters: nothing is handed in.
    const older = { list: (signal?: { throwIfAborted?: () => void }) => {
      signal?.throwIfAborted?.()
      if (signal !== undefined && typeof signal.throwIfAborted !== 'function') {
        throw new TypeError('signal?.throwIfAborted is not a function')
      }
      return Promise.resolve([])
    } }
    const reader = new MetadataReader({
      persistence: older as never,
      projectionCache: undefined,
      logger: { warn: vi.fn() },
    })

    const catalog = await reader.catalog()

    expect(catalog.kind).toBe('read')
  })
})
