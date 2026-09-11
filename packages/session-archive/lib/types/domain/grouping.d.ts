/**
 * The built-in sidebar's grouping rules, restated on the host side.
 *
 * Bulk archive has to select exactly the sessions the user sees under a
 * workspace row or the ungrouped row, so this module mirrors
 * `dsh-client-ui-workspace`'s `groupByWorkspace` / `sessionVisible` verbatim —
 * including the detail that accounting happens *before* the visibility test,
 * which is what keeps an archived ledger member out of ungrouped.
 */
import type { ArchiveSkipReason } from '../contract.js';
/** The facts about a session that grouping needs; a projection of the host's list row. */
export interface SessionListEntry {
    readonly id: string;
    /** `'subagent'` for delegated sessions; undefined for ordinary ones. */
    readonly origin?: string | undefined;
    /** Whether the session has never started a turn. Blank is not the same as logless. */
    readonly blank: boolean;
}
/** One workspace's ordered ledger of session ids. */
export interface WorkspaceLedger {
    readonly workspaceId: string;
    readonly sessionIds: readonly string[];
}
/** Everything grouping reads. */
export interface GroupingInput {
    readonly sessions: readonly SessionListEntry[];
    readonly workspaces: readonly WorkspaceLedger[];
    readonly archived: ReadonlySet<string>;
    /**
     * The session currently selected in the UI, whose blank row stays visible.
     *
     * The host half always passes {@link NO_SELECTION}. The selection is not a
     * host fact: it lives in the browser's `ClientSessions` as a private,
     * per-connection persisted cell projected onto `list.current`, no host RPC
     * carries it, and two attached browsers can hold different values. Bulk
     * archive is unaffected — see {@link NO_SELECTION}.
     */
    readonly current: string | undefined;
}
/**
 * The selection to evaluate the sidebar's predicate against when there is none.
 *
 * Two callers pass this deliberately rather than by omission:
 *
 * - the host half, because it cannot know the browser's selection at all;
 * - {@link planBulkArchive}, because the spec skips blank sessions
 *   *unconditionally* — including the selected one, which is the "new session"
 *   row DSH just opened and the one row a user would not want hidden.
 *
 * Withholding the selection is therefore the mechanism that implements the
 * second rule, not an approximation of the first.
 */
export declare const NO_SELECTION: string | undefined;
/** One row of the grouped view: what belongs to it, and what of that is on screen. */
export interface SessionGroup {
    /** Ledger members that exist in the session list, whether or not they show. */
    readonly accounted: readonly string[];
    /** The subset the built-in sidebar actually renders. */
    readonly visible: readonly string[];
}
/** A workspace row of the grouped view. */
export interface WorkspaceGroup extends SessionGroup {
    readonly workspaceId: string;
}
/** The grouped view of the whole session list. */
export interface SessionGrouping {
    readonly workspaces: readonly WorkspaceGroup[];
    readonly ungrouped: SessionGroup;
}
/**
 * The built-in sidebar's visibility predicate.
 * @param entry - the session row.
 * @param current - the selected session id, whose blank row stays on screen.
 * @param archived - the archive set.
 * @returns whether the built-in sidebar renders this session anywhere.
 */
export declare function sessionVisible(entry: SessionListEntry, current: string | undefined, archived: ReadonlySet<string>): boolean;
/**
 * Group a session list the way the built-in sidebar does.
 * @param input - session list, workspace ledgers, archive set, and selection.
 * @returns per-workspace rows plus the ungrouped complement.
 */
export declare function groupSessions(input: GroupingInput): SessionGrouping;
/** Which display row a bulk archive covers. */
export type BulkArchiveScope = {
    readonly kind: 'workspace';
    readonly workspaceId: string;
} | {
    readonly kind: 'ungrouped';
};
/** One skipped member and the reason it was left alone. */
export interface ArchiveSkip {
    readonly id: string;
    readonly reason: ArchiveSkipReason;
}
/** The archivable members of one display row, plus everything deliberately left out. */
export interface BulkArchivePlan {
    readonly targets: readonly string[];
    readonly skipped: readonly ArchiveSkip[];
    /** True when a workspace scope named a workspace that no longer has a ledger. */
    readonly unknownScope: boolean;
}
/**
 * Select the sessions a "archive everything in this row" action should archive.
 *
 * The plan is the sidebar's own hidden-reason ladder run over the row's
 * accounted members with the selection withheld ({@link NO_SELECTION}), which
 * is what makes the selected blank row skip like any other blank row.
 * `input.current` is therefore deliberately not consulted here, and a test
 * pins that the plan is identical with and without it.
 *
 * @param input - grouping input plus the display row to act on.
 * @returns the archive targets in ledger order and the classified skips.
 */
export declare function planBulkArchive(input: GroupingInput & {
    readonly scope: BulkArchiveScope;
}): BulkArchivePlan;
