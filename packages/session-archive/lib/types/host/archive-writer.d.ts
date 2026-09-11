/**
 * Read and write the archive set.
 *
 * Adding to it is the host's own `archiveSession`. Removing from it has no
 * host API at all — the registry's README says archiving is one-way — so
 * unarchive composes the write out of the private members isolated in
 * `internals/workspace-state`. That composition, and only that, is why this
 * plugin's unarchive capability can be turned off by the startup probe.
 */
import type { OperationOutcome } from '../contract.js';
import type { DomainFacilityLike, WorkspaceRegistryLike } from './internals/workspace-state.js';
/** Collaborators the writer needs, supplied once by the plugin body. */
export interface ArchiveWriterDeps {
    readonly registry: WorkspaceRegistryLike;
    readonly storageDomain: DomainFacilityLike | undefined;
}
/** The archive set, and the two ways it changes. */
export declare class ArchiveWriter {
    private readonly deps;
    constructor(deps: ArchiveWriterDeps);
    /**
     * The current archive set.
     *
     * Read through the registry's public getter rather than the storage domain:
     * the domain would answer with whatever is in memory right now, including a
     * value written half-way through someone else's queued operation.
     *
     * @returns the archived session ids.
     */
    archived(): readonly string[];
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
    archive(ids: readonly string[]): Promise<OperationOutcome[]>;
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
    unarchive(ids: readonly string[]): Promise<OperationOutcome[]>;
    /**
     * The archive-set write itself, shared by unarchive and the last step of a delete.
     * @param ids - sessions to remove.
     * @returns the ids that were actually in the set.
     * @throws when the domain cannot be read; nothing is written in that case.
     */
    dropFromArchiveSet(ids: readonly string[]): Promise<readonly string[]>;
}
