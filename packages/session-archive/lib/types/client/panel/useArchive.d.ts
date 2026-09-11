/**
 * All archive-area state in one hook.
 *
 * The panel below is then a pure rendering of this state, which is what keeps
 * the "which sessions are selected / what did the last operation report" logic
 * out of the JSX and testable in isolation.
 */
import type { ArchiveListResult, CapabilitiesResult, OperationOutcome } from '../../contract.js';
import type { ArchiveApi, CallOutcome } from '../transport/archive-api.js';
/** What the last completed operation reported, ready to render as one line. */
export interface OperationReport {
    readonly kind: 'ok' | 'partial' | 'failed';
    readonly message: string;
    readonly failures: readonly Extract<OperationOutcome, {
        ok: false;
    }>[];
}
/** Everything the panel renders and every action it offers. */
export interface ArchiveState {
    readonly api: ArchiveApi;
    readonly loading: boolean;
    readonly listing: ArchiveListResult | undefined;
    readonly capabilities: CapabilitiesResult | undefined;
    readonly loadError: string | undefined;
    readonly selected: ReadonlySet<string>;
    readonly busy: boolean;
    readonly report: OperationReport | undefined;
    toggle(id: string): void;
    /**
     * Select exactly these ids, on top of whatever is already selected.
     *
     * The caller says what "all" means, because only the caller knows whether a
     * search box is narrowing the list — and a select-all that reached rows the
     * user cannot see would aim a delete at them.
     */
    selectAll(ids: readonly string[]): void;
    clearSelection(): void;
    reload(): void;
    unarchive(): Promise<void>;
    remove(): Promise<void>;
}
/** The prose this hook needs; supplied by the caller so no strings live here. */
export interface ArchiveCopy {
    /** Renders one per-session failure. */
    describe(outcome: Extract<OperationOutcome, {
        ok: false;
    }>): string;
    /** Renders a failure that stopped the call before the host answered. */
    transport(outcome: Extract<CallOutcome<unknown>, {
        ok: false;
    }>): string;
    /** Renders "n sessions unarchived". */
    unarchived(count: number): string;
    /** Renders "n sessions deleted". */
    deleted(count: number): string;
}
/**
 * Drive the archive area.
 * @param api - the bound endpoint set.
 * @param open - whether the panel is showing; closing it drops the selection.
 * @param copy - the strings this hook composes reports out of.
 * @returns the panel's complete state and actions.
 */
export declare function useArchive(api: ArchiveApi, open: boolean, copy: ArchiveCopy): ArchiveState;
