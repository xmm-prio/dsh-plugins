/**
 * Whether one session is holding a live agent, as the host sees it.
 *
 * The session list carries a `running` bit, but it answers a narrower
 * question: whether a turn is in flight. An idle agent still holds its model
 * client, its tools and its log handles, and releasing those is the entire
 * point of closing one — so a button gated on the list's bit would hide
 * exactly in the case the user needs it. Only the host knows which sessions
 * have an agent at all, and `running()` is where it says so.
 *
 * There is no push channel for that population, so this probes instead of
 * subscribing, on the edges where the answer can have changed.
 */
import type { ArchiveApi } from '../transport/archive-api.js';
/**
 * Track one session's agent.
 *
 * @param api - the bound endpoint set.
 * @param sessionId - the session in question.
 * @param midTurn - the session list's `running` bit. A turn in flight means
 *   an agent exists, so this is an answer in its own right; it also moves on
 *   both edges where the population changes (a turn starting may have just
 *   resumed the session), which makes it the re-probe trigger as well.
 * @param epoch - bumped by the caller whenever it closes something, so the
 *   probe re-runs against the population its own action just changed.
 * @returns whether an agent is alive for this session.
 */
export declare function useRunningAgent(api: ArchiveApi, sessionId: string, midTurn: boolean, epoch: number): boolean;
