/**
 * One zero-I/O read of every session's listing metadata.
 *
 * Two consumers share it: the archive area's rows, and the grouping that bulk
 * archive selects from. Both need the same facts, so the host is read once.
 *
 * "Zero-I/O" is the constraint that shapes everything here. Opening a cold log
 * to read a title would make the archive area cost O(archived sessions) log
 * reads, so titles come from the projection cache's checkpoints — the same
 * source, through the same ladder, that the built-in session list uses.
 */

import { describeError } from './errors.js'
import type { PersistenceLike, SessionHeaderLike } from './internals/jsonl-backend.js'

/** The zero-I/O read surface of `ctx.sessionProjectionCache`. */
export interface ProjectionCacheLike {
  cachedSnapshot(
    meta: SessionHeaderLike,
    inheritedEventCount: number,
    keys?: readonly string[],
  ): ProjectionBlock | undefined
  cachedPredecessorTitle(meta: SessionHeaderLike, inheritedEventCount: number): ProjectionBlock | undefined
}

/** A checkpoint's projection values. */
export interface ProjectionBlock {
  readonly asOfSeq: number
  readonly values: Readonly<Record<string, unknown>>
}

/** Collaborators for the reader. */
export interface MetadataReaderDeps {
  readonly persistence: PersistenceLike
  /** `ctx.get('sessionProjectionCache')`; soft, and only titles and activity need it. */
  readonly projectionCache: ProjectionCacheLike | undefined
  readonly logger: { warn(message: string): void }
}

/** One session's listing facts, as far as they can be known without a log read. */
export interface CatalogRow {
  readonly id: string
  readonly createdAt: number
  readonly cwd: string | undefined
  readonly origin: string | undefined
  readonly sizeBytes: number | undefined
  /** No turn has started yet. Not the same as "has no log". */
  readonly blank: boolean
  readonly lastPromptAt: number | undefined
  readonly title: string | undefined
}

/** The session catalog, as read. */
export interface ReadCatalog {
  readonly kind: 'read'
  readonly rows: readonly CatalogRow[]
  /** Served without the projection cache, so titles and activity are missing. */
  readonly degraded: boolean
}

/** No catalog: the corpus could not be enumerated at all. */
export interface UnreadableCatalog {
  readonly kind: 'unreadable'
  /** The host's own message, for a human to act on. */
  readonly reason: string
}

/**
 * The whole session catalog, or the reason there is not one.
 *
 * Two very different absences, and collapsing them into an empty row list is
 * how a user ends up being told their sessions no longer exist. `read` with no
 * rows means the corpus was enumerated and is genuinely empty; `unreadable`
 * means nothing was enumerated, and no statement about any session — including
 * whether it still exists — is available to anyone above this point.
 */
export type Catalog = ReadCatalog | UnreadableCatalog

/**
 * The list-metadata projection registered by the web session controller.
 * Carries `blank` and `lastPromptAt`, which is why no log read is needed to
 * decide whether a session is blank.
 */
const LIST_METADATA_KEY = 'sessionListMetadata'

/** The title projection registered by `@deepseek-ai/dsh-session-title`. */
const TITLE_KEY = 'title'

/**
 * Non-fork sessions have no inherited prefix, and the cache needs the exact cut
 * to establish checkpoint identity.
 */
const NO_INHERITED_PREFIX = 0

/** Read every session's listing metadata without opening a log. */
export class MetadataReader {
  constructor(private readonly deps: MetadataReaderDeps) {}

  /**
   * Read the full session catalog.
   *
   * `persistence.list()` is the corpus: it reports every materialized session
   * plus this process's created-but-unmaterialized ones, which is exactly the
   * set the built-in sidebar can show.
   *
   * The corpus read is the one host call on this path with no smaller unit to
   * fail at: the backend either enumerates every session or throws, and a
   * single unreadable log on disk is enough to make it throw. Letting that out
   * would take the whole archive area down over one bad file, so it is turned
   * into a state the callers above can describe rather than an exception they
   * can only propagate.
   *
   * @param signal - caller cancellation.
   * @returns one row per session, or the reason there are none to give.
   */
  async catalog(signal?: AbortSignal): Promise<Catalog> {
    let snapshots: Awaited<ReturnType<PersistenceLike['list']>>
    try {
      snapshots = await this.deps.persistence.list(signal === undefined ? {} : { signal })
    } catch (error) {
      this.deps.logger.warn(
        `session-archive: the session corpus could not be enumerated, so the archive area has nothing to describe: ${describeError(error)}`,
      )
      return { kind: 'unreadable', reason: describeError(error) }
    }
    const cache = this.deps.projectionCache
    return {
      kind: 'read',
      degraded: cache === undefined,
      rows: snapshots.map((snapshot) => this.rowOf(snapshot.header, snapshot.sizeBytes, cache)),
    }
  }

  private rowOf(
    header: SessionHeaderLike,
    sizeBytes: number | undefined,
    cache: ProjectionCacheLike | undefined,
  ): CatalogRow {
    const values = this.projectionsOf(header, cache)
    const metadata = values[LIST_METADATA_KEY]
    const title = values[TITLE_KEY]
    return {
      id: header.id,
      createdAt: header.createdAt,
      cwd: header.cwd,
      origin: header.origin,
      sizeBytes,
      blank: readBoolean(metadata, 'blank') ?? false,
      lastPromptAt: readNumber(metadata, 'lastPromptAt'),
      title: typeof title === 'string' && title.length > 0 ? title : undefined,
    }
  }

  /**
   * The cold-session projection ladder, as the built-in session list runs it.
   *
   * A forked session is skipped outright rather than queried with a guessed
   * inherited cut: the exact cut is part of the checkpoint's identity and is
   * only obtainable by opening the log, so a guess could only ever miss or —
   * worse — match a different lifecycle. The built-in list makes the same
   * choice, so this loses nothing the official UI shows.
   *
   * Failure degrades to no projections at all. The archive area showing session
   * ids is a far better outcome than the panel refusing to open.
   */
  private projectionsOf(
    header: SessionHeaderLike,
    cache: ProjectionCacheLike | undefined,
  ): Readonly<Record<string, unknown>> {
    if (cache === undefined || header.isSeeded) return {}
    try {
      const block =
        cache.cachedSnapshot(header, NO_INHERITED_PREFIX, [LIST_METADATA_KEY, TITLE_KEY]) ??
        cache.cachedPredecessorTitle(header, NO_INHERITED_PREFIX)
      return block?.values ?? {}
    } catch (error) {
      this.deps.logger.warn(
        `session-archive: projection read for session "${header.id}" failed; serving the row without it: ${describeError(error)}`,
      )
      return {}
    }
  }
}

/** Derive the activity timestamp the built-in list sorts by. */
export function updatedAtOf(row: CatalogRow): number {
  return Math.max(row.createdAt, row.lastPromptAt ?? 0)
}

function readBoolean(source: unknown, key: string): boolean | undefined {
  if (typeof source !== 'object' || source === null) return undefined
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : undefined
}

function readNumber(source: unknown, key: string): number | undefined {
  if (typeof source !== 'object' || source === null) return undefined
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
