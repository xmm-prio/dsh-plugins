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

import { readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import type { OwnershipFailureCode } from '../../contract.js'
import { checkSessionDirectory } from '../../domain/fs-guard.js'
import { describeError, errorMessage, isAlreadyOwnedError, isFormatUnsupportedError } from '../errors.js'

/** Backend label the JSONL persistence implementation shadows `Service.name` with. */
export const JSONL_BACKEND_NAME = 'session-persistence-jsonl'

/** Stand-in for a backend that reports no name at all. */
const UNNAMED_BACKEND = '(unnamed)'

/** Generation filenames the JSONL backend writes, e.g. `session.v3.jsonl.zstd`. */
const GENERATION_FILE = /^session\.v\d+\.jsonl(?:\.zstd)?$/

/** The persistence surface this plugin uses, across both halves of the delete path. */
export interface PersistenceLike {
  readonly name?: string
  /**
   * The backend's own validated plugin config. Public on
   * `JsonlSessionPersistence`, and the only published statement of where the
   * session log root is.
   */
  readonly config?: { readonly root?: unknown }
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
  list(): Promise<readonly PersistenceSnapshot[]>
  stat(id: string): Promise<PersistenceSnapshot | undefined>
  open(id: string, access: 'read' | 'write', options?: unknown): Promise<unknown>
  resolveCurrentLog?(id: string): Promise<string | undefined>
}

/** One session snapshot as the backend reports it. `eventCount` is never filled by JSONL. */
export interface PersistenceSnapshot {
  readonly header: SessionHeaderLike
  readonly revision: unknown
  readonly sizeBytes?: number | undefined
}

/** The immutable session header. There is no `updatedAt`; the web UI derives one. */
export interface SessionHeaderLike {
  readonly id: string
  readonly createdAt: number
  readonly cwd?: string | undefined
  readonly isSeeded: boolean
  readonly origin?: 'subagent' | undefined
}

/** The backend's diagnostic label, or a stand-in when it publishes none. */
export function backendName(persistence: PersistenceLike | undefined): string {
  const name = persistence?.name
  return typeof name === 'string' && name.length > 0 ? name : UNNAMED_BACKEND
}

// --------------------------------------------------------------- the log root

/** Where a known session log root came from. */
export type SessionRootSource =
  /** `sessionPersistence.config.root`, the backend's own published setting. */
  | 'backend-config'
  /** This plugin's `sessionRoot` escape hatch. */
  | 'plugin-config'

/** The session log root, or the reason there is none to be had. */
export type SessionRoot =
  | { readonly known: true; readonly path: string; readonly source: SessionRootSource }
  | { readonly known: false; readonly reason: string }

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
export function resolveSessionRoot(
  persistence: PersistenceLike | undefined,
  configured: string | undefined,
): SessionRoot {
  const declared = persistence?.config?.root
  if (typeof declared === 'string' && declared.length > 0) {
    return { known: true, path: resolve(declared), source: 'backend-config' }
  }
  if (configured !== undefined && configured.length > 0) {
    return { known: true, path: resolve(configured), source: 'plugin-config' }
  }
  return {
    known: false,
    reason: `${backendName(persistence)}.config.root is not a string and no sessionRoot is configured`,
  }
}

/** Render a root verdict as one diagnostic line. */
export function describeSessionRoot(root: SessionRoot): string {
  return root.known ? `${root.path} (from ${root.source})` : `unknown: ${root.reason}`
}

// ------------------------------------------------------------------ locating

/** Where a session's directory came from, or why it could not be found. */
export type LogLocation =
  | { readonly kind: 'current'; readonly dir: string }
  /** A generation newer than this DSH understands; the refusal still carries its path. */
  | { readonly kind: 'unreadable-format'; readonly dir: string; readonly detail: string }
  /** Composed by this plugin, because the backend would not name a path. Unproven. */
  | { readonly kind: 'derived'; readonly dir: string; readonly root: string }
  /** A log exists in an older generation, but the root is unknown so nothing can be derived. */
  | { readonly kind: 'root-unknown'; readonly reason: string }
  /** A log exists in an older generation, and no directory under the root is this session's. */
  | { readonly kind: 'not-found'; readonly root: string }
  /** More than one directory claims the id; the backend refuses these too. */
  | { readonly kind: 'ambiguous'; readonly dirs: readonly string[] }
  /** The session was never materialized; there is nothing on disk. */
  | { readonly kind: 'absent' }

/** Whether the mounted persistence backend is the one this plugin can delete from. */
export function probeDeletableBackend(
  persistence: PersistenceLike,
): { readonly ok: true } | { readonly ok: false; readonly missing: 'backend' | 'resolver'; readonly subject: string } {
  const name = backendName(persistence)
  if (name !== JSONL_BACKEND_NAME) return { ok: false, missing: 'backend', subject: name }
  if (typeof persistence.resolveCurrentLog !== 'function') {
    return { ok: false, missing: 'resolver', subject: `${name}.resolveCurrentLog` }
  }
  return { ok: true }
}

/** Read `location.path` off an already-identified `SessionFormatUnsupportedError`. */
function unsupportedFormatPath(error: unknown): string | undefined {
  const location = (error as { location?: unknown }).location
  if (typeof location !== 'object' || location === null) return undefined
  const path = (location as { path?: unknown }).path
  return typeof path === 'string' && path.length > 0 ? path : undefined
}

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
export async function locateSessionLog(
  persistence: PersistenceLike,
  sessionId: string,
  root: SessionRoot,
): Promise<LogLocation> {
  const resolveLog = persistence.resolveCurrentLog
  if (typeof resolveLog === 'function') {
    try {
      const path = await resolveLog.call(persistence, sessionId)
      if (path !== undefined) return { kind: 'current', dir: dirname(path) }
    } catch (error) {
      if (!isFormatUnsupportedError(error)) throw error
      const path = unsupportedFormatPath(error)
      if (path === undefined) throw error
      return { kind: 'unreadable-format', dir: dirname(path), detail: errorMessage(error) }
    }
  }

  const materialized = (await persistence.stat(sessionId)) !== undefined
  if (!materialized) return { kind: 'absent' }

  if (!root.known) return { kind: 'root-unknown', reason: root.reason }
  const candidates = await findSessionDirs(root.path, sessionId)
  if (candidates.length === 0) return { kind: 'not-found', root: root.path }
  if (candidates.length > 1) return { kind: 'ambiguous', dirs: candidates }
  return { kind: 'derived', dir: candidates[0]!, root: root.path }
}

/**
 * Every `<root>/<project>/<sessionId>` directory, by exact name.
 *
 * The backend's segment encoder lives in an unpublished module, so the only
 * name this can look for is the session id verbatim. That is a search, not a
 * proof: it finds candidates and {@link proveDerivedOwnership} decides whether
 * one may be removed. Matching is whole-name equality, so session `abc` never
 * reaches a directory called `abcdef`.
 *
 * @param root - the session log root.
 * @param sessionId - the session to find; assumed already validated.
 * @returns every absolute candidate directory, in project order.
 */
async function findSessionDirs(root: string, sessionId: string): Promise<string[]> {
  let projects: string[]
  try {
    projects = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }

  const found: string[] = []
  for (const project of projects) {
    const candidate = join(root, project, sessionId)
    try {
      if ((await stat(candidate)).isDirectory()) found.push(candidate)
    } catch {
      continue
    }
  }
  return found
}

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
export async function proveDerivedOwnership(check: {
  readonly dir: string
  readonly sessionId: string
  readonly root: string
}): Promise<OwnershipFailureCode | undefined> {
  const rejection = checkSessionDirectory({ dir: check.dir, sessionId: check.sessionId, root: check.root })
  switch (rejection) {
    case undefined:
      break
    case 'outside-root':
      return 'ownership-outside-root'
    case 'foreign-basename':
    // An id that cannot address a directory cannot be a directory's name
    // either; `LogRemover` rejects those long before this point.
    case 'invalid-session-id':
      return 'ownership-basename-mismatch'
    default:
      return 'ownership-unsafe-root'
  }

  let contents: string[]
  try {
    contents = await readdir(check.dir)
  } catch {
    return 'ownership-generation-missing'
  }
  return contents.some((name) => GENERATION_FILE.test(name)) ? undefined : 'ownership-generation-missing'
}

// -------------------------------------------------------------- write lease

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
export async function probeWriteLeaseReleased(
  persistence: PersistenceLike,
  sessionId: string,
): Promise<{ readonly released: true } | { readonly released: false; readonly detail: string }> {
  let handle: unknown
  try {
    handle = await persistence.open(sessionId, 'write')
  } catch (error) {
    return {
      released: false,
      detail: isAlreadyOwnedError(error)
        ? `the write lease is still held: ${errorMessage(error)}`
        : `the write-lease probe could not be evaluated: ${describeError(error)}`,
    }
  }
  await closeQuietly(handle)
  return { released: true }
}

/** Release a probe handle, tolerating whichever disposal shape the backend returns. */
async function closeQuietly(handle: unknown): Promise<void> {
  if (typeof handle !== 'object' || handle === null) return
  const close = (handle as { close?: unknown }).close
  if (typeof close === 'function') {
    await (close as () => Promise<void>).call(handle)
    return
  }
  const dispose = (handle as { [Symbol.asyncDispose]?: unknown })[Symbol.asyncDispose]
  if (typeof dispose === 'function') await (dispose as () => Promise<void>).call(handle)
}
