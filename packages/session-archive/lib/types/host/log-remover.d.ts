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
import type { OperationOutcome } from '../contract.js';
import type { AgentTeardown } from './agent-teardown.js';
import type { ArchiveWriter } from './archive-writer.js';
import type { PersistenceLike, SessionRoot } from './internals/jsonl-backend.js';
import type { WorkspaceRegistryLike } from './internals/workspace-state.js';
/** Collaborators for the delete path. */
export interface LogRemoverDeps {
    readonly persistence: PersistenceLike;
    readonly registry: WorkspaceRegistryLike;
    readonly teardown: AgentTeardown;
    readonly archive: ArchiveWriter;
    /** The session log root, established once at mount. */
    readonly sessionRoot: SessionRoot;
    readonly logger: {
        info(message: string): void;
        warn(message: string): void;
    };
}
/** Remove archived sessions' logs from disk. */
export declare class LogRemover {
    private readonly deps;
    constructor(deps: LogRemoverDeps);
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
    remove(ids: readonly string[]): Promise<OperationOutcome[]>;
    private removeOne;
    /**
     * Vouch for the directory about to be removed.
     *
     * A backend-supplied path is checked for containment and shape only —
     * asserting a basename this plugin cannot reproduce would be second-guessing
     * the backend's own segment encoder, and a wrong guess there refuses every
     * legitimate delete. A derived path has no such authority behind it, so all
     * four ownership proofs must hold and the failing one is what gets reported.
     */
    private vouchFor;
    /** Resolve the directory to remove, or the refusal that stands in its way. */
    private locate;
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
    private forgetSession;
}
