/**
 * Delete one archived session's log directory.
 *
 * The only irreversible thing this plugin does, so the order is fixed and every
 * step is a gate rather than a best effort:
 *
 * 1. the session must be in the archive set — deletion is never a shortcut past
 *    archiving, and the archive area is the only place it can be triggered;
 * 2. the live agent must be gone, confirmed by the public write-lease probe;
 * 3. the directory must be named by the backend, never composed by this plugin;
 * 4. the path must pass the containment guard;
 * 5. only then is anything removed;
 * 6. finally the id leaves the archive set and every workspace ledger, so no
 *    row is left pointing at a directory that no longer exists.
 *
 * A gate that cannot be evaluated refuses. It never degrades into "probably
 * fine".
 */

import { rm } from 'node:fs/promises'

import type { OperationOutcome } from '../contract.js'
import { checkSessionDirectory } from '../domain/fs-guard.js'
import { validateSessionId } from '../domain/session-id.js'
import type { AgentTeardown } from './agent-teardown.js'
import type { ArchiveWriter } from './archive-writer.js'
import { describeError } from './errors.js'
import { locateSessionLog, probeWriteLeaseReleased } from './internals/jsonl-backend.js'
import type { PersistenceLike } from './internals/jsonl-backend.js'
import type { WorkspaceRegistryLike } from './internals/workspace-state.js'
import { failure, success } from './outcome.js'

/** Collaborators for the delete path. */
export interface LogRemoverDeps {
  readonly persistence: PersistenceLike
  readonly registry: WorkspaceRegistryLike
  readonly teardown: AgentTeardown
  readonly archive: ArchiveWriter
  /** Configured log root; used as the containment root and as a last-resort locator. */
  readonly sessionRoot: string | undefined
  readonly logger: { info(message: string): void; warn(message: string): void }
}

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
    if ('code' in located) return failure(id, located.code, located.detail)

    if (located.dir !== undefined) {
      const lease = await probeWriteLeaseReleased(this.deps.persistence, id)
      if (!lease.released) return failure(id, 'write-lease-held', lease.detail)

      const refusal = checkSessionDirectory({
        dir: located.dir,
        // Only claim basename ownership for a path this plugin composed itself.
        // The backend resolves a session directory through a segment encoder
        // that is not published, so asserting a reproduction of it would be a
        // guess, and a wrong guess here refuses every legitimate delete.
        ...(located.owned ? { sessionId: id } : {}),
        ...(this.deps.sessionRoot === undefined ? {} : { root: this.deps.sessionRoot }),
      })
      if (refusal !== undefined) return failure(id, 'log-path-refused', `${refusal}: ${located.dir}`)

      try {
        await rm(located.dir, { recursive: true, force: true })
        this.deps.logger.info(`session-archive: removed log directory of session "${id}"`)
      } catch (error) {
        return failure(id, 'remove-failed', describeError(error))
      }
    }

    await this.forgetSession(id)
    return success(id)
  }

  /** Resolve the directory to remove, or the refusal that stands in its way. */
  private async locate(
    id: string,
  ): Promise<
    | { readonly dir: string | undefined; readonly owned: boolean }
    | { readonly code: 'legacy-log-format' | 'host-error'; readonly detail: string }
  > {
    let location: Awaited<ReturnType<typeof locateSessionLog>>
    try {
      location = await locateSessionLog(this.deps.persistence, id, this.deps.sessionRoot)
    } catch (error) {
      return { code: 'host-error', detail: describeError(error) }
    }

    switch (location.kind) {
      case 'current':
        return { dir: location.dir, owned: false }
      case 'unreadable-format':
        // The refusal still names the exact artifact, so the directory is known
        // even though this DSH build will not read the generation inside it.
        this.deps.logger.warn(`session-archive: session "${id}" stores an unreadable generation: ${location.detail}`)
        return { dir: location.dir, owned: false }
      case 'scanned':
        return { dir: location.dir, owned: true }
      case 'absent':
        // Never materialized. There is nothing to remove, but the bookkeeping
        // still has to run so the id stops appearing in the archive area.
        return { dir: undefined, owned: false }
      case 'legacy-format':
      default:
        return {
          code: 'legacy-log-format',
          detail:
            'the log is stored in an older format version, so the backend will not name its path; set sessionRoot to allow a scan',
        }
    }
  }

  /**
   * Drop the id from the archive set and from every workspace ledger.
   *
   * Both are required for the row to actually disappear: an id left in a ledger
   * comes back as a visible session pointing at nothing, and an id left in the
   * archive set comes back as an archive-area row with no log.
   */
  private async forgetSession(id: string): Promise<void> {
    for (const workspace of this.deps.registry.list()) {
      if (!workspace.sessionIds.includes(id)) continue
      try {
        await workspace.detachSession(id)
      } catch (error) {
        this.deps.logger.warn(
          `session-archive: could not detach deleted session "${id}" from workspace "${workspace.id}": ${describeError(error)}`,
        )
      }
    }
    try {
      await this.deps.archive.dropFromArchiveSet([id])
    } catch (error) {
      this.deps.logger.warn(
        `session-archive: removed the log of session "${id}" but could not update the archive set: ${describeError(error)}`,
      )
    }
  }
}
