/**
 * Close one session's agent, from that session's own header.
 *
 * DSH has no way to stop a single agent: opening a session in the web UI
 * resumes it, and it then stays alive until the process exits. The archive
 * area's bulk action releases what is running in the *background*, which by
 * construction excludes the session in front of you — so the only place the
 * current one can be closed from is here.
 *
 * Registered into `conversation.session.header.utilities`, a public slot with
 * `scope: 'session'`, so `sessionId` arrives as a standard prop and nothing
 * about the header is patched.
 *
 * Closing a parent closes its subagents too: the host's own `scope.dispose()`
 * cascades into every child agent the session created, so "close this
 * session's agents" is this one call rather than a traversal.
 */
import type { Context } from '@deepseek-ai/cordis';
/** The standard props a session-scoped slot occupant receives. */
export interface SessionHeaderProps {
    readonly sessionId: string;
    /** Session list and current selection; the source of the `running` bit. */
    readonly useSessions: <T>(selector: (state: SessionListSnapshot) => T) => T;
}
/** The slice of the session list this component reads. */
interface SessionListSnapshot {
    readonly byId: Readonly<Record<string, {
        readonly running: boolean;
        readonly displayTitle: string;
    } | undefined>>;
}
/**
 * Build the header button bound to one plugin context.
 * @param ctx - the browser plugin context.
 * @returns the slot component.
 */
export declare function createSessionShutdown(ctx: Context): (props: SessionHeaderProps) => JSX.Element | null;
export {};
