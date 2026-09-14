/**
 * Which running sessions each surface is allowed to close.
 *
 * The two entry points differ in exactly this, and nowhere else. Keeping the
 * rule here rather than inside a component's callback means it can be stated
 * once, named after the concept the button is named after, and checked
 * without mounting anything.
 */
import type { RunningSession } from '../../contract.js';
import type { ShutdownTarget } from './useShutdown.js';
/**
 * The background sessions, in host order.
 *
 * "Background" is the whole meaning of the archive area's button: it frees
 * what is running out of sight. The session on screen is by definition not
 * that, and it is also the one whose teardown a user would least expect from
 * a button in another panel — its own header carries the button for it.
 *
 * @param sessions - every session the host reports an agent for.
 * @param currentSessionId - the session the browser is showing, if any.
 * @returns the closable sessions, labelled for the confirmation.
 */
export declare function backgroundTargets(sessions: readonly RunningSession[], currentSessionId: string | undefined): readonly ShutdownTarget[];
