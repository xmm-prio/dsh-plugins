/**
 * Stop a running agent by SessionId.
 *
 * Deleting a log while its agent is alive is not merely racy — the agent's next
 * append recreates the directory that was just removed. Teardown therefore runs
 * first, and it runs the host's own disposer rather than reproducing it:
 * `cancel({kind:'disposed'})` → `whenIdle()` → `scope.dispose()` →
 * `handle.close()` (this is what releases the write lease) → detach from the
 * agent and session registries. Cancelling and disposing the scope alone would
 * leave the agent registered and its lease held.
 *
 * Liveness comes from the public `ctx.agents` registry. The private fiber scan
 * is used only to reach the disposer, so the two can be cross-checked — and a
 * live agent with no matching effect label means the host changed its label
 * convention, which must fail loudly rather than read as "nothing was running".
 */

import type { OperationOutcome } from '../contract.js'
import { describeError } from './errors.js'
import { findAgentLifecycleEffects, listLiveAgentSessionIds, runEffectDisposer } from './internals/agent-effects.js'
import type { RegistryLike } from './internals/agent-effects.js'
import { failure, success } from './outcome.js'

/** The slice of `ctx.agents` used here; both members are public API. */
export interface AgentRegistryLike {
  get(id: string): { readonly id: string } | undefined
  list(): readonly { readonly id: string }[]
}

/** Collaborators for teardown. */
export interface AgentTeardownDeps {
  /** `ctx.registry`, the cordis plugin registry the effect scan walks. */
  readonly registry: RegistryLike
  /** `ctx.get('agents')`; soft, because liveness degrades to the effect labels. */
  readonly agents: AgentRegistryLike | undefined
}

/** What one teardown attempt did. */
export type TeardownResult =
  /** A live agent was found and the host's disposer ran to completion. */
  | { readonly kind: 'disposed' }
  /** Nothing was running under this SessionId. */
  | { readonly kind: 'not-running' }

/**
 * Raised when the host no longer looks the way this plugin expects.
 *
 * Deliberately loud. A silent "no effect found" reads exactly like "nothing was
 * running", and the caller would go on to delete a live session's log.
 */
export class TeardownShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TeardownShapeError'
  }
}

/** Tear down live agents through the host's own lifecycle effect. */
export class AgentTeardown {
  /**
   * Teardowns currently running, keyed by SessionId.
   *
   * The cordis effect wrapper is not externally memoized: a second call returns
   * `undefined` rather than a joinable thenable, so concurrent callers have to
   * be collapsed here.
   */
  private readonly inFlight = new Map<string, Promise<TeardownResult>>()

  constructor(private readonly deps: AgentTeardownDeps) {}

  /**
   * Sessions that currently have a live agent.
   *
   * Prefers the public registry; the effect labels are the fallback for a
   * profile that does not mount `ctx.agents`.
   *
   * @returns the live session ids.
   */
  liveSessionIds(): readonly string[] {
    const { agents } = this.deps
    if (agents === undefined) return listLiveAgentSessionIds(this.deps.registry)
    return agents.list().map((agent) => agent.id)
  }

  /**
   * Dispose one session's agent, if it has one.
   * @param sessionId - the session to stop.
   * @returns whether a live agent was actually torn down.
   * @throws {TeardownShapeError} when liveness and the effect labels disagree,
   * or when the disposer finished with the agent still registered.
   */
  async teardown(sessionId: string): Promise<TeardownResult> {
    const running = this.inFlight.get(sessionId)
    if (running !== undefined) return running

    const attempt = this.dispose(sessionId).finally(() => {
      this.inFlight.delete(sessionId)
    })
    this.inFlight.set(sessionId, attempt)
    return attempt
  }

  /**
   * Dispose every live agent, reporting each one separately.
   *
   * One failure never stops the rest: the point of the action is to release
   * background resources, and a stuck session must not hold the others hostage.
   *
   * @returns one outcome per session that had a live agent.
   */
  async teardownAll(): Promise<OperationOutcome[]> {
    const outcomes: OperationOutcome[] = []
    for (const id of this.liveSessionIds()) {
      try {
        await this.teardown(id)
        outcomes.push(success(id))
      } catch (error) {
        outcomes.push(failure(id, 'teardown-effect-missing', describeError(error)))
      }
    }
    return outcomes
  }

  private async dispose(sessionId: string): Promise<TeardownResult> {
    const { agents, registry } = this.deps
    const effects = findAgentLifecycleEffects(registry, sessionId)

    if (effects.length > 1) {
      throw new TeardownShapeError(
        `${String(effects.length)} lifecycle effects carry session "${sessionId}"; refusing to guess which one to dispose`,
      )
    }

    if (effects.length === 0) {
      if (agents?.get(sessionId) !== undefined) {
        throw new TeardownShapeError(
          `session "${sessionId}" has a live agent but no "agentLoop.lifecycle" effect; the host's effect labels changed`,
        )
      }
      return { kind: 'not-running' }
    }

    // wrapper(), not `await wrapper`. Awaiting the wrapper resolves its
    // PromiseLike trap to cordis's internal disposeAsync function and runs no
    // disposer at all, which would leave the write lease held.
    await runEffectDisposer(effects[0]!)

    if (agents?.get(sessionId) !== undefined) {
      throw new TeardownShapeError(
        `disposed the lifecycle effect of session "${sessionId}" but its agent is still registered`,
      )
    }
    return { kind: 'disposed' }
  }
}
