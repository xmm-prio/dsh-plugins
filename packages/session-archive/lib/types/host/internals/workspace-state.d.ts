/**
 * The only module that touches `WorkspaceRegistry`'s private state.
 *
 * Reading the archive set needs nothing private — `archivedSessionIds` is a
 * public getter, and going through it keeps reads on the registry's own
 * mutex chain. Only the unarchive *write* has no public counterpart: the host
 * ships `archiveSession` and documents archiving as one-way.
 *
 * Two TypeScript-`private` members carry that write. Both are ordinary runtime
 * properties (not `#private`): `enqueueOperation` is a prototype method and
 * `state` is an instance field. If a future DSH release changes either, the
 * capability probe below turns unarchive off and this file is the only one that
 * needs rewriting.
 */
/** The public surface of `ctx.workspaceRegistry` this plugin relies on. */
export interface WorkspaceRegistryLike {
    readonly archivedSessionIds: readonly string[];
    archiveSession(sessionId: string): Promise<void>;
    list(): readonly WorkspaceEntityLike[];
}
/** The public surface of one `WorkspaceEntity`. */
export interface WorkspaceEntityLike {
    readonly id: string;
    readonly title: string;
    readonly path: string;
    readonly sessionIds: readonly string[];
    detachSession(sessionId: string): Promise<void>;
}
/** The `workspace` storage domain's global record, as far as this plugin reads it. */
export interface WorkspaceDomainState {
    readonly archivedSessionIds: readonly string[];
    readonly [key: string]: unknown;
}
/** Why the archive set could not be read. Never conflated with "the set is empty". */
export type DomainReadFailure = 'domain-facility-unavailable' | 'domain-not-open' | 'global-unreadable' | 'state-malformed';
/** A read that either produced state or explains its absence. */
export type DomainRead = {
    readonly ok: true;
    readonly state: WorkspaceDomainState;
} | {
    readonly ok: false;
    readonly reason: DomainReadFailure;
};
/** The `storageDomain` facility, narrowed to the diagnostic surface used here. */
export interface DomainFacilityLike {
    get(name: string): DomainHandleLike | undefined;
}
/** One open storage domain's global slot. */
export interface DomainHandleLike {
    readonly global: {
        get(): unknown;
        set(value: unknown): Promise<void>;
    };
}
/**
 * Read the workspace domain's global record.
 *
 * `storageDomain.get` is documented as a diagnostic surface that answers
 * `undefined` for a domain that is not open, so every step below distinguishes
 * "nothing to read" from "an empty archive set" — treating a failed read as
 * `{}` and spreading it back would erase `workspaceIds`.
 *
 * @param facility - `ctx.storageDomain`, or undefined when the service is absent.
 * @returns the state, or the reason it could not be obtained.
 */
export declare function readWorkspaceDomainState(facility: DomainFacilityLike | undefined): DomainRead;
/**
 * Compute the successor state with some ids dropped from the archive set.
 *
 * Whole-object replacement, mirroring the host's own `setState`: the cached
 * `registry.state` is swapped for a new object rather than having its array
 * mutated in place, so a holder of the old reference sees a consistent value.
 *
 * @param state - the state just read from the domain.
 * @param removed - ids leaving the archive set.
 * @returns the successor state, and which of `removed` were actually present.
 */
export declare function withoutArchived(state: WorkspaceDomainState, removed: readonly string[]): {
    readonly next: WorkspaceDomainState;
    readonly dropped: readonly string[];
};
/**
 * What the unarchive write needs from the registry, and whether it is all there.
 *
 * The failure names the absent member in `subject`. That name is a fact about
 * this DSH build and stays free text: this module is where host-private names
 * are allowed to be written down, and callers pass the string along rather
 * than branching on it.
 */
export type PrivateWriteProbe = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly subject: string;
};
/**
 * Shape-check the two private members the unarchive write path uses.
 *
 * A shape check only — nothing here calls `enqueueOperation`, because a probe
 * that queues work on the registry's mutex chain is a side effect.
 *
 * @param registry - the live `ctx.workspaceRegistry`.
 * @returns whether both private members are present and of the right kind.
 */
export declare function probePrivateWritePath(registry: WorkspaceRegistryLike): PrivateWriteProbe;
/**
 * Run one operation on the registry's own serialization chain.
 *
 * Joining the official chain is not an optimization: it is what keeps this
 * write from interleaving with `archiveSession`, and `enqueueOperation` also
 * awaits `recoverPendingMutation()` before running the body, which a private
 * queue would skip.
 *
 * @param registry - the live registry.
 * @param operation - the body to run under the registry's mutex.
 * @returns the operation's result.
 */
export declare function enqueueRegistryOperation<T>(registry: WorkspaceRegistryLike, operation: () => Promise<T>): Promise<T>;
/**
 * Refresh the registry's in-memory state cache after an out-of-band domain write.
 *
 * `WorkspaceRegistry` caches the global record and does not subscribe to
 * `domain/changed`, so without this the next `archiveSession` would write the
 * stale set back and a page reload would show the sessions archived again.
 *
 * @param registry - the live registry.
 * @param next - the state that was just persisted.
 */
export declare function backfillRegistryState(registry: WorkspaceRegistryLike, next: WorkspaceDomainState): void;
/**
 * Persist a replacement global record for the workspace domain.
 * @param facility - `ctx.storageDomain`.
 * @param next - the successor state.
 */
export declare function writeWorkspaceDomainState(facility: DomainFacilityLike, next: WorkspaceDomainState): Promise<void>;
