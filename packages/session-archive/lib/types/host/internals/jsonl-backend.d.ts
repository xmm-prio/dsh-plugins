/**
 * The only module that knows where a session's log lives on disk.
 *
 * Deletion is bound to the JSONL backend by identity, never guessed. The
 * trustworthy source of a session directory is `resolveCurrentLog`, which is
 * public and returns an absolute path; `dirname` of it is the session
 * directory.
 *
 * That source has a hole: a log written in a pre-migration generation exists
 * on disk but `resolveCurrentLog` refuses to name it. Leaving those sessions
 * undeletable would stop the archive area's whole reason for existing one step
 * short, so this module also *derives* a directory for them — and because a
 * derived path is a guess about an irreversible operation, it is only ever
 * handed on after {@link proveDerivedOwnership} has established that the
 * directory really is that session's.
 */
import type { OwnershipFailureCode } from '../../contract.js';
/** Backend label the JSONL persistence implementation shadows `Service.name` with. */
export declare const JSONL_BACKEND_NAME = "session-persistence-jsonl";
/** The persistence surface this plugin uses, across both halves of the delete path. */
export interface PersistenceLike {
    readonly name?: string;
    /**
     * The backend's own validated plugin config. Public on
     * `JsonlSessionPersistence`, and the only published statement of where the
     * session log root is.
     */
    readonly config?: {
        readonly root?: unknown;
    };
    /**
     * Every read below is declared *without* the cancellation argument the
     * backend also accepts, and that omission is load-bearing.
     *
     * Where the token goes is not stable across DSH versions. `list` took it
     * positionally as `list(signal)` and now takes `list({ signal })`; within
     * one version `resolveCurrentLog(id, signal)` is positional while
     * `stat(id, { signal })` is not. Passing the wrong shape is not a missed
     * optimization but a thrown error: an options object handed to the older
     * `list` is a truthy non-signal, and the backend's own `signal?.
     * throwIfAborted()` then fails with "not a function" — which is how the
     * archive area once refused to open against an older host.
     *
     * Omitting the argument is the one call shape every version accepts, and
     * cancellation is an optimization this plugin can afford to lose: these are
     * short reads whose results are discarded if nobody is waiting. So the
     * parameter is absent from the type, not merely unused, and the compiler is
     * what keeps a future caller from reaching for it again.
     */
    list(): Promise<readonly PersistenceSnapshot[]>;
    stat(id: string): Promise<PersistenceSnapshot | undefined>;
    open(id: string, access: 'read' | 'write', options?: unknown): Promise<unknown>;
    resolveCurrentLog?(id: string): Promise<string | undefined>;
}
/** One session snapshot as the backend reports it. `eventCount` is never filled by JSONL. */
export interface PersistenceSnapshot {
    readonly header: SessionHeaderLike;
    readonly revision: unknown;
    readonly sizeBytes?: number | undefined;
}
/** The immutable session header. There is no `updatedAt`; the web UI derives one. */
export interface SessionHeaderLike {
    readonly id: string;
    readonly createdAt: number;
    readonly cwd?: string | undefined;
    readonly isSeeded: boolean;
    readonly origin?: 'subagent' | undefined;
}
/** The backend's diagnostic label, or a stand-in when it publishes none. */
export declare function backendName(persistence: PersistenceLike | undefined): string;
/** Where a known session log root came from. */
export type SessionRootSource = 
/** `sessionPersistence.config.root`, the backend's own published setting. */
'backend-config'
/** This plugin's `sessionRoot` escape hatch. */
 | 'plugin-config';
/** The session log root, or the reason there is none to be had. */
export type SessionRoot = {
    readonly known: true;
    readonly path: string;
    readonly source: SessionRootSource;
} | {
    readonly known: false;
    readonly reason: string;
};
/**
 * Establish the session log root without hardcoding a path.
 *
 * The backend answers for itself: `config` is public on
 * `JsonlSessionPersistence` and `config.root` is a required setting with no
 * default, resolved to an absolute path exactly the way this function resolves
 * it. Reading it costs nothing and cannot disagree with the backend, which is
 * why it comes first — a `sessionRoot` left over in someone's `cordis.yml`
 * must not be able to point the containment guard at the wrong tree.
 *
 * The escape hatch is therefore for one situation only: a DSH build where that
 * property has moved. Failure mode when neither is available: `deleteLegacy`
 * is reported blocked, no path is ever derived, and a log the backend still
 * addresses continues to delete normally.
 *
 * @param persistence - the mounted persistence service.
 * @param configured - this plugin's `sessionRoot`, when set.
 * @returns the absolute root and where it came from, or why it is unknown.
 */
export declare function resolveSessionRoot(persistence: PersistenceLike | undefined, configured: string | undefined): SessionRoot;
/** Render a root verdict as one diagnostic line. */
export declare function describeSessionRoot(root: SessionRoot): string;
/** Where a session's directory came from, or why it could not be found. */
export type LogLocation = {
    readonly kind: 'current';
    readonly dir: string;
}
/** A generation newer than this DSH understands; the refusal still carries its path. */
 | {
    readonly kind: 'unreadable-format';
    readonly dir: string;
    readonly detail: string;
}
/** Composed by this plugin, because the backend would not name a path. Unproven. */
 | {
    readonly kind: 'derived';
    readonly dir: string;
    readonly root: string;
}
/** A log exists in an older generation, but the root is unknown so nothing can be derived. */
 | {
    readonly kind: 'root-unknown';
    readonly reason: string;
}
/** A log exists in an older generation, and no directory under the root is this session's. */
 | {
    readonly kind: 'not-found';
    readonly root: string;
}
/** More than one directory claims the id; the backend refuses these too. */
 | {
    readonly kind: 'ambiguous';
    readonly dirs: readonly string[];
}
/** The session was never materialized; there is nothing on disk. */
 | {
    readonly kind: 'absent';
};
/** Whether the mounted persistence backend is the one this plugin can delete from. */
export declare function probeDeletableBackend(persistence: PersistenceLike): {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly missing: 'backend' | 'resolver';
    readonly subject: string;
};
/**
 * Find the directory holding one session's log.
 *
 * `resolveCurrentLog` answering `undefined` means one of two very different
 * things — no log at all, or a log stored in a generation older than the
 * current format. The second still has bytes on disk, so it must never be
 * reported as "nothing to delete". `stat` tells the two apart, because it
 * migrates older generations on read while `resolveCurrentLog` refuses them.
 *
 * @param persistence - the mounted persistence service.
 * @param sessionId - the session to locate; assumed already validated.
 * @param root - the session log root, as established at mount.
 * @returns where the directory is, or why there is none to remove.
 */
export declare function locateSessionLog(persistence: PersistenceLike, sessionId: string, root: SessionRoot): Promise<LogLocation>;
/**
 * Establish that a self-derived directory really is one session's log directory.
 *
 * Four proofs, all required, reported one at a time so a refusal says which
 * expectation broke. The three that need no filesystem run first, so nothing
 * is read off a path whose shape is already inadmissible; the order they are
 * *reported* in is therefore not the order the spec lists them, but the set is
 * the same and any single failure aborts the delete.
 *
 * Proof 1 restates what {@link findSessionDirs} searched for. That is
 * deliberate: the search is an implementation of the derivation and this is
 * the assertion the `rm` stands on, and the assertion must not be reachable
 * only through the code that happens to satisfy it today.
 *
 * @param check - the candidate directory, its claimed session, and the root.
 * @returns the failed proof, or undefined when all four hold.
 */
export declare function proveDerivedOwnership(check: {
    readonly dir: string;
    readonly sessionId: string;
    readonly root: string;
}): Promise<OwnershipFailureCode | undefined>;
/**
 * Confirm that nobody holds the session's write lease.
 *
 * This is the one fully public completion criterion for agent teardown:
 * `open(id, 'write')` throws `SessionAlreadyOwnedError` while a lease is out.
 * A successful open therefore proves the write path is free — and immediately
 * makes *this* code the owner, so the handle is closed before returning.
 *
 * Any other failure is also "not released": the probe is the last gate before
 * an irreversible removal, so a probe that could not be evaluated refuses
 * rather than assuming the best. Naming the lease case apart is what tells a
 * user to close the session from a probe that broke for some other reason.
 *
 * @param persistence - the mounted persistence service.
 * @param sessionId - the session to probe.
 * @returns whether the write path is free, and the refusal message when not.
 */
export declare function probeWriteLeaseReleased(persistence: PersistenceLike, sessionId: string): Promise<{
    readonly released: true;
} | {
    readonly released: false;
    readonly detail: string;
}>;
