/**
 * Delete one archived session's log directory.
 *
 * The only irreversible thing this plugin does, so the order is fixed and every
 * step is a gate rather than a best effort:
 *
 * 1. the session must be in the archive set — deletion is never a shortcut past
 *    archiving, and the archive area is the only place it can be triggered;
 * 2. the live agent must be torn down;
 * 3. the write lease must be observably released, by the public probe;
 * 4. the directory must be named by the backend and pass the containment guard,
 *    or — for a log the backend refuses to address — be derived here and then
 *    *proven* to be this session's;
 * 5. only then is anything removed;
 * 6. finally the id leaves every workspace ledger and then the archive set, so
 *    no row is left pointing at a directory that no longer exists.
 *
 * A gate that cannot be evaluated refuses. It never degrades into "probably
 * fine", and it never reports success for a step that did not happen.
 */

import { rm } from 'node:fs/promises'

import type { FailureCode, OperationFailure, OperationOutcome } from '../contract.js'
import { checkSessionDirectory } from '../domain/fs-guard.js'
import { validateSessionId } from '../domain/session-id.js'
import type { AgentTeardown } from './agent-teardown.js'
import type { ArchiveWriter } from './archive-writer.js'
import { describeError } from './errors.js'
import { locateSessionLog, probeWriteLeaseReleased, proveDerivedOwnership } from './internals/jsonl-backend.js'
import type { PersistenceLike, SessionRoot } from './internals/jsonl-backend.js'
import type { WorkspaceRegistryLike } from './internals/workspace-state.js'
import { failure, success } from './outcome.js'

/** Collaborators for the delete path. */
export interface LogRemoverDeps {
  readonly persistence: PersistenceLike
  readonly registry: WorkspaceRegistryLike
  readonly teardown: AgentTeardown
  readonly archive: ArchiveWriter
  /** The session log root, established once at mount. */
  readonly sessionRoot: SessionRoot
  readonly logger: { info(message: string): void; warn(message: string): void }
}

/** What the locate step settled on for one session. */
type Located =
  /** The backend named this directory; its own encoder vouches for the name. */
  | { readonly kind: 'backend'; readonly dir: string }
  /** This plugin composed this directory; nothing vouches for it until it is proven. */
  | { readonly kind: 'derived'; readonly dir: string; readonly root: string }
  /** Nothing on disk. The bookkeeping still runs. */
  | { readonly kind: 'nothing' }
  /** No directory may be removed, and this is why. */
  | { readonly kind: 'refused'; readonly code: FailureCode; readonly detail: string }

/** Remove archived sessions' logs from disk. */
export class LogRemover {
  constructor(private readonly deps: LogRemoverDeps) {}

  /**
   * Delete a batch of archived sessions.
   *
   * Sequential, and each session is independent: one refusal never cancels the
   * rest, and each outcome carries its own reason so the panel can show exactly
   * which ones survived and why.
   *
   * @param ids - sessions to delete.
   * @returns one outcome per id, in input order.
   */
  async remove(ids: readonly string[]): Promise<OperationOutcome[]> {
    const archived = new Set(this.deps.archive.archived())
    const outcomes: OperationOutcome[] = []
    for (const id of ids) outcomes.push(await this.removeOne(id, archived))
    return outcomes
  }

  private async removeOne(id: string, archived: ReadonlySet<string>): Promise<OperationOutcome> {
    const invalid = validateSessionId(id)
    if (invalid !== undefined) return failure(id, 'invalid-session-id', invalid)
    if (!archived.has(id)) {
      return failure(id, 'not-archived', 'only an archived session can be deleted')
    }

    try {
      await this.deps.teardown.teardown(id)
    } catch (error) {
      return failure(id, 'teardown-effect-missing', describeError(error))
    }

    const located = await this.locate(id)
    if (located.kind === 'refused') return failure(id, located.code, located.detail)

    if (located.kind !== 'nothing') {
      const lease = await probeWriteLeaseReleased(this.deps.persistence, id)
      if (!lease.released) return failure(id, 'write-lease-held', lease.detail)

      const refusal = await this.vouchFor(id, located)
      if (refusal !== undefined) return refusal

      try {
        await rm(located.dir, { recursive: true, force: true })
      } catch (error) {
        return failure(id, 'remove-failed', describeError(error))
      }
      this.deps.logger.info(
        located.kind === 'derived'
          ? `session-archive: removed log directory ${located.dir} of session "${id}"; the path was derived by this plugin under ${located.root}, not supplied by the backend`
          : `session-archive: removed log directory ${located.dir} of session "${id}"`,
      )
    }

    return (await this.forgetSession(id)) ?? success(id)
  }

  /**
   * Vouch for the directory about to be removed.
   *
   * A backend-supplied path is checked for containment and shape only —
   * asserting a basename this plugin cannot reproduce would be second-guessing
   * the backend's own segment encoder, and a wrong guess there refuses every
   * legitimate delete. A derived path has no such authority behind it, so all
   * four ownership proofs must hold and the failing one is what gets reported.
   */
  private async vouchFor(
    id: string,
    located: Extract<Located, { kind: 'backend' | 'derived' }>,
  ): Promise<OperationFailure | undefined> {
    if (located.kind === 'derived') {
      const proof = await proveDerivedOwnership({ dir: located.dir, sessionId: id, root: located.root })
      if (proof === undefined) return undefined
      this.deps.logger.warn(
        `session-archive: refusing to remove derived path ${located.dir} for session "${id}": ${proof}`,
      )
      return failure(id, proof, `${proof}: ${located.dir}`)
    }

    const root = this.deps.sessionRoot
    const rejection = checkSessionDirectory({ dir: located.dir, ...(root.known ? { root: root.path } : {}) })
    return rejection === undefined ? undefined : failure(id, 'log-path-refused', `${rejection}: ${located.dir}`)
  }

  /** Resolve the directory to remove, or the refusal that stands in its way. */
  private async locate(id: string): Promise<Located> {
    let location: Awaited<ReturnType<typeof locateSessionLog>>
    try {
      location = await locateSessionLog(this.deps.persistence, id, this.deps.sessionRoot)
    } catch (error) {
      return { kind: 'refused', code: 'host-error', detail: describeError(error) }
    }

    switch (location.kind) {
      case 'current':
        return { kind: 'backend', dir: location.dir }
      case 'unreadable-format':
        // The refusal still names the exact artifact, so the directory is known
        // even though this DSH build will not read the generation inside it.
        this.deps.logger.warn(`session-archive: session "${id}" stores an unreadable generation: ${location.detail}`)
        return { kind: 'backend', dir: location.dir }
      case 'derived':
        return { kind: 'derived', dir: location.dir, root: location.root }
      case 'absent':
        // Never materialized. There is nothing to remove, but the bookkeeping
        // still has to run so the id stops appearing in the archive area.
        return { kind: 'nothing' }
      case 'root-unknown':
        return { kind: 'refused', code: 'log-root-unknown', detail: location.reason }
      case 'ambiguous':
        return {
          kind: 'refused',
          code: 'log-path-refused',
          detail: `more than one directory claims this session: ${location.dirs.join(', ')}`,
        }
      case 'not-found':
      default:
        return {
          kind: 'refused',
          code: 'legacy-log-not-found',
          detail: `the backend will not name this session's log and no directory under ${location.root} is named after it`,
        }
    }
  }

  /**
   * Drop the id from every workspace ledger and then from the archive set.
   *
   * Both are required for the row to actually disappear, and the order is the
   * delete sequence's own: an id left in a ledger comes back as a visible
   * session pointing at nothing, so it must go first, and the archive set is
   * released last because leaving the set is what makes the session eligible
   * to reappear.
   *
   * A failure here is reported, never logged and swallowed. The log is already
   * gone at this point, so the honest thing to tell a user is which half of the
   * bookkeeping survived — and the archive-set write is deliberately skipped
   * when a ledger still holds the id, because releasing it then would resurface
   * the session as a live, ungrouped row over a directory that no longer
   * exists.
   *
   * @returns the failure to report, or undefined when the session is fully forgotten.
   */
  private async forgetSession(id: string): Promise<OperationFailure | undefined> {
    const stuck: string[] = []
    for (const workspace of this.deps.registry.list()) {
      if (!workspace.sessionIds.includes(id)) continue
      try {
        await workspace.detachSession(id)
      } catch (error) {
        stuck.push(`${workspace.id}: ${describeError(error)}`)
      }
    }
    if (stuck.length > 0) {
      const detail = `the log is deleted, but the session is still in ${String(stuck.length)} workspace ledger(s) and was left in the archive set — ${stuck.join('; ')}`
      this.deps.logger.warn(`session-archive: could not detach deleted session "${id}": ${detail}`)
      return failure(id, 'ledger-detach-failed', detail)
    }

    try {
      await this.deps.archive.dropFromArchiveSet([id])
    } catch (error) {
      const detail = `the log is deleted and the workspace ledgers are clean, but the id is still in the archive set: ${describeError(error)}`
      this.deps.logger.warn(`session-archive: archive set not updated for deleted session "${id}": ${detail}`)
      return failure(id, 'archive-set-stale', detail)
    }
    return undefined
  }
}
