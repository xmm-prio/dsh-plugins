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
const EFFECT_SYMBOL = Symbol.for('cordis.effect')

/**
 * An effect disposer as it sits in `fiber._disposables`.
 *
 * It is callable *and* thenable, and the two do very different things:
 * `await wrapper` resolves to the inner `disposeAsync` function and runs no
 * disposer at all, while `wrapper()` returns a thenable that actually performs
 * the teardown. Only ever call it.
 */
export type EffectWrapper = (() => unknown) & { [EFFECT_SYMBOL]?: { label?: unknown } }

/** A located effect: its label and the wrapper that runs it. */
export interface LocatedEffect {
  readonly label: string
  readonly wrapper: EffectWrapper
}

/** The slice of `ctx.registry` the scan walks. */
export interface RegistryLike {
  values(): Iterable<{ readonly fibers?: Iterable<{ readonly _disposables?: Iterable<unknown> }> }>
}

/** Prefix of the agent lifecycle effect label. */
const LIFECYCLE_PREFIX = 'agentLoop.lifecycle('

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
export function agentLifecycleLabel(sessionId: string): string {
  return `${LIFECYCLE_PREFIX}${sessionId})`
}

/**
 * Recover the SessionId from a lifecycle label.
 * @param label - a cordis effect label.
 * @returns the SessionId, or undefined when the label is not a lifecycle label.
 */
export function sessionIdFromLifecycleLabel(label: string): string | undefined {
  if (!label.startsWith(LIFECYCLE_PREFIX) || !label.endsWith(')')) return undefined
  return label.slice(LIFECYCLE_PREFIX.length, -1)
}

/** Read the label cordis stamped on a disposer, if it is a labelled effect wrapper. */
function labelOf(disposable: unknown): string | undefined {
  if (typeof disposable !== 'function') return undefined
  const meta = (disposable as EffectWrapper)[EFFECT_SYMBOL]
  if (typeof meta !== 'object' || meta === null) return undefined
  const label = (meta as { label?: unknown }).label
  return typeof label === 'string' ? label : undefined
}

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
export function scanLabelledEffects(registry: RegistryLike): LocatedEffect[] {
  const found: LocatedEffect[] = []
  for (const runtime of registry.values()) {
    const fibers = runtime.fibers
    if (fibers === undefined) continue
    for (const fiber of fibers) {
      const disposables = fiber._disposables
      if (disposables === undefined) continue
      for (const disposable of disposables) {
        const label = labelOf(disposable)
        if (label !== undefined) found.push({ label, wrapper: disposable as EffectWrapper })
      }
    }
  }
  return found
}

/**
 * Locate the lifecycle effect of one session.
 * @param registry - `ctx.registry`.
 * @param sessionId - the session to look for.
 * @returns the matching effects; more than one means the host changed shape.
 */
export function findAgentLifecycleEffects(registry: RegistryLike, sessionId: string): LocatedEffect[] {
  const label = agentLifecycleLabel(sessionId)
  return scanLabelledEffects(registry).filter((effect) => effect.label === label)
}

/**
 * List every session that currently has a live agent.
 * @param registry - `ctx.registry`.
 * @returns the SessionIds carried by installed lifecycle effects, deduplicated.
 */
export function listLiveAgentSessionIds(registry: RegistryLike): string[] {
  const ids = new Set<string>()
  for (const effect of scanLabelledEffects(registry)) {
    const id = sessionIdFromLifecycleLabel(effect.label)
    if (id !== undefined) ids.add(id)
  }
  return [...ids]
}

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
export async function runEffectDisposer(effect: LocatedEffect): Promise<void> {
  await effect.wrapper()
}

/** Whether the cordis registry exposes the enumeration surface the scan needs. */
export function probeEffectScan(registry: unknown): boolean {
  if (typeof registry !== 'object' || registry === null) return false
  const values = (registry as { values?: unknown }).values
  if (typeof values !== 'function') return false
  try {
    const iterated = (registry as RegistryLike).values()
    if (typeof (iterated as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function') return false
    for (const runtime of iterated) {
      const fibers = runtime.fibers
      if (fibers === undefined) continue
      if (typeof (fibers as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function') return false
      for (const fiber of fibers) {
        const disposables = fiber._disposables
        if (disposables === undefined) return false
        if (typeof (disposables as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function') return false
        return true
      }
    }
    // No fiber carries disposables yet; the surface itself is intact.
    return true
  } catch {
    return false
  }
}
