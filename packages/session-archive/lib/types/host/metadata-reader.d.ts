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
import type { PersistenceLike, SessionHeaderLike } from './internals/jsonl-backend.js';
/** The zero-I/O read surface of `ctx.sessionProjectionCache`. */
export interface ProjectionCacheLike {
    cachedSnapshot(meta: SessionHeaderLike, inheritedEventCount: number, keys?: readonly string[]): ProjectionBlock | undefined;
    cachedPredecessorTitle(meta: SessionHeaderLike, inheritedEventCount: number): ProjectionBlock | undefined;
}
/** A checkpoint's projection values. */
export interface ProjectionBlock {
    readonly asOfSeq: number;
    readonly values: Readonly<Record<string, unknown>>;
}
/** Collaborators for the reader. */
export interface MetadataReaderDeps {
    readonly persistence: PersistenceLike;
    /** `ctx.get('sessionProjectionCache')`; soft, and only titles and activity need it. */
    readonly projectionCache: ProjectionCacheLike | undefined;
    readonly logger: {
        warn(message: string): void;
    };
}
/** One session's listing facts, as far as they can be known without a log read. */
export interface CatalogRow {
    readonly id: string;
    readonly createdAt: number;
    readonly cwd: string | undefined;
    readonly origin: string | undefined;
    readonly sizeBytes: number | undefined;
    /** No turn has started yet. Not the same as "has no log". */
    readonly blank: boolean;
    readonly lastPromptAt: number | undefined;
    readonly title: string | undefined;
}
/** The whole session catalog, and whether it was served without the cache. */
export interface Catalog {
    readonly rows: readonly CatalogRow[];
    readonly degraded: boolean;
}
/** Read every session's listing metadata without opening a log. */
export declare class MetadataReader {
    private readonly deps;
    constructor(deps: MetadataReaderDeps);
    /**
     * Read the full session catalog.
     *
     * `persistence.list()` is the corpus: it reports every materialized session
     * plus this process's created-but-unmaterialized ones, which is exactly the
     * set the built-in sidebar can show.
     *
     * @param signal - caller cancellation.
     * @returns one row per session, and whether the projection cache was there.
     */
    catalog(signal?: AbortSignal): Promise<Catalog>;
    private rowOf;
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
    private projectionsOf;
}
/** Derive the activity timestamp the built-in list sorts by. */
export declare function updatedAtOf(row: CatalogRow): number;
