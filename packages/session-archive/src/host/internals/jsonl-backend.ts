/**
 * The only module that knows where a session's log lives on disk.
 *
 * Deletion is bound to the JSONL backend by identity, never guessed: the
 * segment encoder that composes `<root>/<projectKey>/<sessionDir>` lives in the
 * backend's unpublished `src/`, so the sole trustworthy source of a session
 * directory is `resolveCurrentLog`, which is public and returns an absolute
 * path. `dirname` of it is the session directory.
 */

import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Backend label the JSONL persistence implementation shadows `Service.name` with. */
export const JSONL_BACKEND_NAME = 'session-persistence-jsonl'

/** Generation filenames the JSONL backend writes, e.g. `session.v3.jsonl.zstd`. */
const GENERATION_FILE = /^session\.v\d+\.jsonl(?:\.zstd)?$/

/** The persistence surface this plugin uses, across both halves of the delete path. */
export interface PersistenceLike {
  readonly name?: string
  list(options?: { signal?: AbortSignal }): Promise<readonly PersistenceSnapshot[]>
  stat(id: string, options?: { signal?: AbortSignal }): Promise<PersistenceSnapshot | undefined>
  open(id: string, access: 'read' | 'write', options?: unknown): Promise<unknown>
  resolveCurrentLog?(id: string, signal?: AbortSignal): Promise<string | undefined>
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

/** Where a session's directory came from, or why it could not be found. */
export type LogLocation =
  | { readonly kind: 'current'; readonly dir: string }
  /** A generation newer than this DSH understands; the refusal still carries its path. */
  | { readonly kind: 'unreadable-format'; readonly dir: string; readonly detail: string }
  /** Located by scanning the configured session root, because the backend gave no path. */
  | { readonly kind: 'scanned'; readonly dir: string }
  /** A log exists, but only in a pre-migration generation the backend will not address. */
  | { readonly kind: 'legacy-format' }
  /** The session was never materialized; there is nothing on disk. */
  | { readonly kind: 'absent' }

/** Whether the mounted persistence backend is the one this plugin can delete from. */
export function probeDeletableBackend(
  persistence: PersistenceLike,
): { readonly ok: true } | { readonly ok: false; readonly missing: 'backend' | 'resolver'; readonly subject: string } {
  const name = typeof persistence.name === 'string' ? persistence.name : '(unnamed)'
  if (name !== JSONL_BACKEND_NAME) return { ok: false, missing: 'backend', subject: name }
  if (typeof persistence.resolveCurrentLog !== 'function') {
    return { ok: false, missing: 'resolver', subject: `${name}.resolveCurrentLog` }
  }
  return { ok: true }
}

/** Read `location.path` off a `SessionFormatUnsupportedError` without importing the class. */
function unsupportedFormatPath(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
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
 * @param sessionId - the session to locate.
 * @param sessionRoot - configured escape-hatch log root, used to scan when the
 * backend will not name a path.
 * @param signal - caller cancellation.
 * @returns where the directory is, or why there is none to remove.
 */
export async function locateSessionLog(
  persistence: PersistenceLike,
  sessionId: string,
  sessionRoot: string | undefined,
  signal?: AbortSignal,
): Promise<LogLocation> {
  const resolve = persistence.resolveCurrentLog
  if (typeof resolve === 'function') {
    try {
      const path = await resolve.call(persistence, sessionId, signal)
      if (path !== undefined) return { kind: 'current', dir: dirname(path) }
    } catch (error) {
      const path = unsupportedFormatPath(error)
      if (path === undefined) throw error
      return {
        kind: 'unreadable-format',
        dir: dirname(path),
        detail: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const materialized = (await persistence.stat(sessionId, signal === undefined ? {} : { signal })) !== undefined
  if (!materialized) return { kind: 'absent' }

  const scanned = sessionRoot === undefined ? undefined : await scanForSessionDir(sessionRoot, sessionId, signal)
  return scanned === undefined ? { kind: 'legacy-format' } : { kind: 'scanned', dir: scanned }
}

/**
 * Escape hatch: find `<root>/<project>/<sessionId>` by walking one level of
 * project directories.
 *
 * The backend's segment encoder is unreachable, so this only finds directories
 * whose name is the session id verbatim — an exact match, never a prefix, so a
 * session `abc` can never resolve onto `abcdef`. The directory must also
 * actually contain a generation file, so an empty look-alike is not accepted.
 *
 * @param root - configured session log root.
 * @param sessionId - the session to find; assumed already validated.
 * @param signal - caller cancellation.
 * @returns the absolute directory, or undefined when no candidate qualifies.
 */
async function scanForSessionDir(root: string, sessionId: string, signal?: AbortSignal): Promise<string | undefined> {
  let projects: string[]
  try {
    projects = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return undefined
  }

  for (const project of projects) {
    signal?.throwIfAborted()
    const candidate = join(root, project, sessionId)
    try {
      if (!(await stat(candidate)).isDirectory()) continue
      const contents = await readdir(candidate)
      if (contents.some((name) => GENERATION_FILE.test(name))) return candidate
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * Confirm that nobody holds the session's write lease.
 *
 * This is the one fully public completion criterion for agent teardown:
 * `open(id, 'write')` throws `SessionAlreadyOwnedError` while a lease is out.
 * A successful open therefore proves the write path is free — and immediately
 * makes *this* code the owner, so the handle is closed before returning.
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
    return { released: false, detail: error instanceof Error ? error.message : String(error) }
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
