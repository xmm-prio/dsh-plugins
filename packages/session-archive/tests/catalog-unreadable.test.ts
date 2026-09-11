/**
 * What the archive area says when the session corpus cannot be read at all.
 *
 * The corpus read is the one host call with no smaller unit to fail at — the
 * backend enumerates every session or throws — so the interesting behaviour is
 * not "does it survive" but "what does it claim". The claims it must not make
 * are the subject here: that the archive area is empty, and that the archived
 * sessions no longer exist.
 */

import { describe, expect, it, vi } from 'vitest'

import { MetadataReader } from '../src/host/metadata-reader.js'
import { SessionArchiveService } from '../src/host/service.js'
import type { SessionArchiveDeps } from '../src/host/service.js'

const ARCHIVED = ['session-a', 'session-b', 'session-c']

/** A capability report with everything switched on. */
const ALL_AVAILABLE = Object.fromEntries(
  (['archive', 'unarchive', 'shutdown', 'delete', 'deleteLegacy', 'metadata'] as const).map((id) => [
    id,
    { available: true },
  ]),
)

/**
 * A reader over a backend whose `list` behaves as given.
 *
 * The real `MetadataReader` is used rather than a stub, because the decision
 * under test — turn a thrown corpus read into a state — is its decision.
 */
function readerOver(list: () => Promise<unknown>, warn: (message: string) => void) {
  return new MetadataReader({
    persistence: { list } as never,
    projectionCache: undefined,
    logger: { warn },
  })
}

/** A service whose catalog comes from `reader` and whose archive set is fixed. */
function serviceWith(reader: MetadataReader, archive: Partial<SessionArchiveDeps['archive']> = {}) {
  return new SessionArchiveService({
    capabilities: ALL_AVAILABLE,
    persistenceBackend: 'session-persistence-jsonl',
    version: '0.0.0-test',
    registry: { list: () => [], archivedSessionIds: ARCHIVED },
    metadata: reader,
    archive: { archived: () => ARCHIVED, ...archive },
    teardown: {},
    remover: {},
  } as never)
}

describe('a session corpus that cannot be enumerated', () => {
  it('becomes a state rather than an exception, and is logged once', async () => {
    const warn = vi.fn()
    const catalog = await readerOver(() => {
      throw new TypeError('signal?.throwIfAborted is not a function')
    }, warn).catalog()

    expect(catalog.kind).toBe('unreadable')
    expect(catalog.kind === 'unreadable' && catalog.reason).toContain('throwIfAborted')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('could not be enumerated')
  })

  it('is not reported as an empty archive area', async () => {
    const listing = await serviceWith(
      readerOver(() => Promise.reject(new Error('EIO: i/o error')), vi.fn()),
    ).list()

    expect(listing.entries).toEqual([])
    expect(listing.catalogError).toContain('EIO')
  })

  it('never claims the archived sessions are gone', async () => {
    const listing = await serviceWith(
      readerOver(() => Promise.reject(new Error('EIO: i/o error')), vi.fn()),
    ).list()

    // Every archived id would land in `unresolved` if an unreadable catalog
    // were treated as an empty one — which reads as "the backend no longer
    // has them", the one thing a failed read cannot possibly establish.
    expect(listing.unresolved).toEqual([])
    expect(listing.degraded).toBe(false)
  })

  it('refuses a bulk archive instead of archiving nothing and calling it done', async () => {
    const archive = vi.fn()
    const result = await serviceWith(
      readerOver(() => Promise.reject(new Error('EIO: i/o error')), vi.fn()),
      { archive } as never,
    ).archiveUngrouped()

    expect(result.refusal?.code).toBe('catalog-unreadable')
    expect(result.refusal?.detail).toContain('EIO')
    expect(result.archived).toEqual([])
    expect(archive).not.toHaveBeenCalled()
  })

  it('still distinguishes a corpus that really is empty', async () => {
    const listing = await serviceWith(readerOver(() => Promise.resolve([]), vi.fn())).list()

    expect(listing.catalogError).toBeUndefined()
    // The archive set holds three ids the corpus does not: that *is* a claim
    // this read is entitled to make.
    expect(listing.unresolved).toEqual(ARCHIVED)
  })
})
