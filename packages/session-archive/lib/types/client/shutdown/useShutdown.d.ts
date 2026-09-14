/**
 * The one shutdown flow, shared by both surfaces that offer it.
 *
 * Closing one session from its own header and closing every background
 * session from the archive area differ in exactly one place — which sessions
 * end up in the list — and in nothing else. Collecting the targets is
 * therefore the caller's job, and everything after it (confirm, call, report)
 * happens here, so the two entry points cannot drift into two different
 * notions of what closing a session means.
 */
import type { OperationOutcome } from '../../contract.js';
import type { ArchiveApi, CallOutcome } from '../transport/archive-api.js';
/** One session a shutdown is about to close. */
export interface ShutdownTarget {
    readonly id: string;
    /** What to call it in the confirmation; never empty. */
    readonly label: string;
}
/** What a collector found. */
export type ShutdownPlan = 
/** These sessions, in the order they should be shown and closed. */
{
    readonly kind: 'targets';
    readonly targets: readonly ShutdownTarget[];
}
/** Nothing will be closed, and this is the sentence saying why. */
 | {
    readonly kind: 'refused';
    readonly message: string;
};
/** The prose this hook composes its reports out of; no strings live here. */
export interface ShutdownCopy {
    /** Renders "nothing was running". */
    nothing: string;
    /** Renders "n sessions closed", together with whatever did not close. */
    report(closed: number, failures: readonly Extract<OperationOutcome, {
        ok: false;
    }>[]): string;
    /** Renders a failure that stopped the call before the host answered. */
    transport(outcome: Extract<CallOutcome<unknown>, {
        ok: false;
    }>): string;
}
/** What came of an attempt, for a caller deciding how loudly to say it. */
export interface ShutdownReport {
    /** The sentence to show, whichever way it went. */
    readonly message: string;
    /** Everything asked for happened; the message is a plain confirmation. */
    readonly ok: boolean;
}
/** The flow, as the buttons consume it. */
export interface ShutdownFlow {
    /** A call is in flight, in either phase. */
    readonly busy: boolean;
    /** The list awaiting confirmation, or undefined while nothing is pending. */
    readonly pending: readonly ShutdownTarget[] | undefined;
    /** Collect the targets and open the confirmation. */
    start(): void;
    cancel(): void;
    confirm(): void;
}
/**
 * Drive a shutdown from collection to report.
 *
 * @param api - the bound endpoint set.
 * @param collect - decides what this surface means by "close"; a refusal or
 *   an empty list is reported without ever opening a confirmation, because
 *   there is nothing for the user to confirm. Must be identity-stable.
 * @param copy - the strings the reports are composed from.
 * @param onReport - where the outcome goes; the caller owns the status line.
 *   Called once per attempt, including the ones that never reached the host.
 * @returns the flow.
 */
export declare function useShutdown(api: ArchiveApi, collect: () => Promise<ShutdownPlan>, copy: ShutdownCopy, onReport: (report: ShutdownReport) => void): ShutdownFlow;
