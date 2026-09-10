/**
 * Read and write the archive set.
 *
 * Adding to it is the host's own `archiveSession`. Removing from it has no
 * host API at all — the registry's README says archiving is one-way — so
 * unarchive composes the write out of the private members isolated in
 * `internals/workspace-state`. That composition, and only that, is why this
 * plugin's unarchive capability can be turned off by the startup probe.
 */

import type { OperationOutcome } from '../contract.js'
import { validateSessionId } from '../domain/session-id.js'
import { describeError, isUnknownSessionError } from './errors.js'
import {
  backfillRegistryState,
  enqueueRegistryOperation,
  readWorkspaceDomainState,
  withoutArchived,
  writeWorkspaceDomainState,
} from './internals/workspace-state.js'
import type { DomainFacilityLike, WorkspaceRegistryLike } from './internals/workspace-state.js'

/** Collaborators the writer needs, supplied once by the plugin body. */
export interface ArchiveWriterDeps {
  readonly registry: WorkspaceRegistryLike
  readonly storageDomain: DomainFacilityLike | undefined
}

import { failure } from './outcome.js'

/** The archive set, and the two ways it changes. */
export class ArchiveWriter {
  constructor(private readonly deps: ArchiveWriterDeps) {}

  /**
   * The current archive set.
   *
   * Read through the registry's public getter rather than the storage domain:
   * the domain would answer with whatever is in memory right now, including a
   * value written half-way through someone else's queued operation.
   *
   * @returns the archived session ids.
   */
  archived(): readonly string[] {
    return this.deps.registry.archivedSessionIds
  }

  /**
   * Add sessions to the archive set, one at a time.
   *
   * Sequential on purpose: each `archiveSession` is a durable global write that
   * fans out to every connected browser, so a parallel batch would produce a
   * push storm for no gain. The host call is idempotent and independent of
   * workspace membership.
   *
   * @param ids - sessions to archive.
   * @returns one outcome per id, in input order.
   */
  async archive(ids: readonly string[]): Promise<OperationOutcome[]> {
    const outcomes: OperationOutcome[] = []
    for (const id of ids) {
      const invalid = validateSessionId(id)
      if (invalid !== undefined) {
        outcomes.push(failure(id, 'invalid-session-id', invalid))
        continue
      }
      try {
        await this.deps.registry.archiveSession(id)
        outcomes.push({ id, ok: true })
      } catch (error) {
        outcomes.push(
          isUnknownSessionError(error)
            ? failure(id, 'unknown-session', describeError(error))
            : failure(id, 'host-error', describeError(error)),
        )
      }
    }
    return outcomes
  }

  /**
   * Remove sessions from the archive set.
   *
   * The whole batch is one operation on the registry's own mutex chain, so it
   * cannot interleave with an official `archiveSession`, and
   * `enqueueOperation` runs `recoverPendingMutation()` first — a private queue
   * would silently skip that recovery.
   *
   * A read that fails is never treated as an empty set: spreading `{}` back
   * over the global record would erase `workspaceIds`.
   *
   * @param ids - sessions to remove from the archive set.
   * @returns one outcome per id, in input order.
   */
  async unarchive(ids: readonly string[]): Promise<OperationOutcome[]> {
    const invalid = new Map<string, string>()
    const candidates: string[] = []
    for (const id of ids) {
      const rejection = validateSessionId(id)
      if (rejection === undefined) candidates.push(id)
      else invalid.set(id, rejection)
    }

    let dropped: ReadonlySet<string>
    try {
      dropped = new Set(await this.dropFromArchiveSet(candidates))
    } catch (error) {
      return ids.map((id) =>
        invalid.has(id)
          ? failure(id, 'invalid-session-id', invalid.get(id)!)
          : failure(id, 'archive-set-unreadable', describeError(error)),
      )
    }

    return ids.map((id) => {
      if (invalid.has(id)) return failure(id, 'invalid-session-id', invalid.get(id)!)
      if (dropped.has(id)) return { id, ok: true }
      return failure(id, 'not-archived', 'the session is not in the archive set')
    })
  }

  /**
   * The archive-set write itself, shared by unarchive and the last step of a delete.
   * @param ids - sessions to remove.
   * @returns the ids that were actually in the set.
   * @throws when the domain cannot be read; nothing is written in that case.
   */
  async dropFromArchiveSet(ids: readonly string[]): Promise<readonly string[]> {
    if (ids.length === 0) return []
    const { registry, storageDomain } = this.deps
    return enqueueRegistryOperation(registry, async () => {
      const read = readWorkspaceDomainState(storageDomain)
      if (!read.ok) throw new Error(`workspace storage domain unreadable (${read.reason}); refusing to write`)
      const { next, dropped } = withoutArchived(read.state, ids)
      if (dropped.length === 0) return dropped
      await writeWorkspaceDomainState(storageDomain!, next)
      // The registry caches the global record and does not observe
      // `domain/changed`; without this the next archive would write the stale
      // set back and a page reload would resurrect these ids.
      backfillRegistryState(registry, next)
      return dropped
    })
  }
}
