/**
 * The only module that knows how a running agent is torn down.
 *
 * DSH exposes no way to stop an agent by id: `AgentRegistry` has no `stop`, and
 * the `AgentHandle` that owns `dispose` goes to whoever created the agent — the
 * web session controller destructures it away and keeps only `.agent`. What is
 * reachable is the cordis effect that agent-loop folds the whole teardown into,
 * whose label carries the SessionId.
 *
 * Calling that effect *is* the official teardown: cancel, drain, close the
 * persistence handle (releasing the write lease), detach from both registries.
 * Nothing here re-implements any of it.
 */
/** cordis stamps effect metadata on the wrapper under this global-registry symbol. */
declare const EFFECT_SYMBOL: unique symbol;
/**
 * An effect disposer as it sits in `fiber._disposables`.
 *
 * It is callable *and* thenable, and the two do very different things:
 * `await wrapper` resolves to the inner `disposeAsync` function and runs no
 * disposer at all, while `wrapper()` returns a thenable that actually performs
 * the teardown. Only ever call it.
 */
export type EffectWrapper = (() => unknown) & {
    [EFFECT_SYMBOL]?: {
        label?: unknown;
    };
};
/** A located effect: its label and the wrapper that runs it. */
export interface LocatedEffect {
    readonly label: string;
    readonly wrapper: EffectWrapper;
}
/** The slice of `ctx.registry` the scan walks. */
export interface RegistryLike {
    values(): Iterable<{
        readonly fibers?: Iterable<{
            readonly _disposables?: Iterable<unknown>;
        }>;
    }>;
}
/**
 * The exact label agent-loop gives one session's lifecycle effect.
 *
 * Matched as a whole string, never as a prefix: the same source file also emits
 * `agentLoop.resume(<id>)`, where the id is a *configured agent id*, not a
 * SessionId. A `startsWith('agentLoop.')` scan would tear down the wrong thing.
 *
 * @param sessionId - the session whose agent should be disposed.
 * @returns the effect label to match verbatim.
 */
export declare function agentLifecycleLabel(sessionId: string): string;
/**
 * Recover the SessionId from a lifecycle label.
 * @param label - a cordis effect label.
 * @returns the SessionId, or undefined when the label is not a lifecycle label.
 */
export declare function sessionIdFromLifecycleLabel(label: string): string | undefined;
/**
 * Walk every fiber of every plugin runtime and collect the labelled effects.
 *
 * The scan deliberately visits all runtimes rather than guessing an owner:
 * `ctx.agents.resume()` runs with `this.ctx` bound to the *caller's* context,
 * so on the web path the lifecycle effect lands on the session controller's
 * fiber, not agent-loop's. It also does not assume top-level disposables are
 * top-level effects — a nested `ctx.effect()` that is never yielded stays in
 * the same list, at the same level.
 *
 * `_disposables` is a `DisposableList`: iterable, but with no `.values()`.
 *
 * @param registry - `ctx.registry`.
 * @returns every labelled effect currently installed, in traversal order.
 */
export declare function scanLabelledEffects(registry: RegistryLike): LocatedEffect[];
/**
 * Locate the lifecycle effect of one session.
 * @param registry - `ctx.registry`.
 * @param sessionId - the session to look for.
 * @returns the matching effects; more than one means the host changed shape.
 */
export declare function findAgentLifecycleEffects(registry: RegistryLike, sessionId: string): LocatedEffect[];
/**
 * List every session that currently has a live agent.
 * @param registry - `ctx.registry`.
 * @returns the SessionIds carried by installed lifecycle effects, deduplicated.
 */
export declare function listLiveAgentSessionIds(registry: RegistryLike): string[];
/**
 * Run a located effect's disposer to completion.
 *
 * `wrapper()` — with the call. Awaiting the wrapper itself resolves the
 * thenable to cordis's internal `disposeAsync` function and runs nothing, which
 * would leave the session's write lease held while the caller went on to delete
 * its log directory.
 *
 * The wrapper is not externally memoized either: a second call returns
 * `undefined` rather than a joinable thenable, so concurrent callers must be
 * deduplicated above this function.
 *
 * @param effect - the located effect.
 */
export declare function runEffectDisposer(effect: LocatedEffect): Promise<void>;
/** Whether the cordis registry exposes the enumeration surface the scan needs. */
export declare function probeEffectScan(registry: unknown): boolean;
export {};
