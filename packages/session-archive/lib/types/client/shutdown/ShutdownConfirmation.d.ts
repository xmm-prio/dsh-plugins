/**
 * The card shown before any agent is stopped.
 *
 * It lists the sessions by name rather than counting them. A count is not
 * something a user can check: "关闭 7 个会话" is agreed to on trust, while a
 * list is agreed to on sight, and the one thing this action must never do is
 * stop a conversation someone is in the middle of.
 *
 * `Modal` with its default chrome, not `RiskConfirmation`. The acknowledgement
 * checkbox belongs to the irreversible action next door; stopping an agent is
 * undone by opening the session again, and asking for a checkbox here would
 * flatten a distinction the user needs to keep.
 */
import type { ShutdownFlow } from './useShutdown.js';
/**
 * Render the pending confirmation of one shutdown flow.
 * @param flow - the flow; nothing renders while it has no pending list.
 * @param title - heading, which differs between the two entry points.
 * @param note - the caption under the list, for whatever this surface has to
 *   add about scope.
 */
export declare function ShutdownConfirmation({ flow, title, note, }: {
    flow: ShutdownFlow;
    title: string;
    note: string;
}): JSX.Element;
