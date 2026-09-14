import { describe, expect, it, vi } from 'vitest'

import { AgentTeardown, TeardownShapeError } from '../src/host/agent-teardown.js'
import type { AgentTeardownDeps } from '../src/host/agent-teardown.js'
import type { RegistryLike } from '../src/host/internals/agent-effects.js'

const EFFECT = Symbol.for('cordis.effect')

function wrapper(label: string, body: () => unknown = () => undefined) {
  const fn = Object.assign(() => body(), {
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(onFulfilled(() => {})),
  })
  Object.defineProperty(fn, EFFECT, { value: { label, children: [] } })
  return fn
}

function registryOf(...disposables: unknown[]): RegistryLike {
  return { values: () => [{ fibers: [{ _disposables: disposables }] }] }
}

/**
 * A fake `ctx.agents`.
 * @param ids - live root agents.
 * @param children - live agents owned by another agent, as subagents are.
 */
function agentsOf(ids: string[], children: string[] = []) {
  const live = new Set([...ids, ...children])
  const owned = new Set(children)
  return {
    get: (id: string) => (live.has(id) ? { id } : undefined),
    list: () => [...live].map((id) => ({ id })),
    roots: () => [...live].filter((id) => !owned.has(id)).map((id) => ({ id })),
    retire: (id: string) => live.delete(id),
  }
}

const logger = { error: () => {} }

/** Build the collaborators, defaulting everything a test does not care about. */
function deps(overrides: Partial<AgentTeardownDeps> = {}): AgentTeardownDeps {
  return { registry: registryOf(), agents: agentsOf([]), logger, ...overrides }
}

describe('AgentTeardown.teardown', () => {
  it('runs the host disposer for a live agent and confirms it deregistered', async () => {
    const agents = agentsOf(['s1'])
    const body = vi.fn(() => {
      agents.retire('s1')
    })
    const teardown = new AgentTeardown(
      deps({ registry: registryOf(wrapper('agentLoop.lifecycle(s1)', body)), agents }),
    )
    await expect(teardown.teardown('s1')).resolves.toEqual({ kind: 'disposed' })
    expect(body).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for a cold session', async () => {
    const teardown = new AgentTeardown(deps())
    await expect(teardown.teardown('s1')).resolves.toEqual({ kind: 'not-running' })
  })

  it('fails loudly when a live agent has no lifecycle effect', async () => {
    const teardown = new AgentTeardown(deps({ agents: agentsOf(['s1']) }))
    await expect(teardown.teardown('s1')).rejects.toBeInstanceOf(TeardownShapeError)
    await expect(teardown.teardown('s1')).rejects.toThrow(/effect labels changed/)
  })

  it('never mistakes the agentLoop.resume decoy for a lifecycle effect', async () => {
    const teardown = new AgentTeardown(
      deps({
        registry: registryOf(wrapper('agentLoop.resume(s1)'), wrapper('agentLoop.resume-load(s1)')),
        agents: agentsOf(['s1']),
      }),
    )
    await expect(teardown.teardown('s1')).rejects.toThrow(/no "agentLoop.lifecycle" effect/)
  })

  it('refuses to guess when two effects carry the same session', async () => {
    const registry: RegistryLike = {
      values: () => [
        { fibers: [{ _disposables: [wrapper('agentLoop.lifecycle(s1)')] }] },
        { fibers: [{ _disposables: [wrapper('agentLoop.lifecycle(s1)')] }] },
      ],
    }
    const teardown = new AgentTeardown(deps({ registry, agents: agentsOf(['s1']) }))
    await expect(teardown.teardown('s1')).rejects.toThrow(/refusing to guess/)
  })

  it('fails when the disposer ran but the agent is still registered', async () => {
    const teardown = new AgentTeardown(
      deps({ registry: registryOf(wrapper('agentLoop.lifecycle(s1)')), agents: agentsOf(['s1']) }),
    )
    await expect(teardown.teardown('s1')).rejects.toThrow(/still registered/)
  })

  /**
   * A cordis effect is single-shot, so the second attempt at a session whose
   * teardown already failed finds no effect at all — the same shape as a host
   * that renamed its labels. Reporting the rename would send whoever reads it
   * looking for an upstream change that did not happen.
   */
  it('blames the failed teardown, not the host, when the effect was already spent', async () => {
    // cordis drops a disposer from the fiber tree once it has run, whether or
    // not it succeeded, so the failed agent stays live with no effect behind it.
    const disposables: unknown[] = []
    disposables.push(
      wrapper('agentLoop.lifecycle(s1)', () => {
        disposables.length = 0
        return Promise.reject(new Error('handle close failed'))
      }),
    )
    const registry = { values: () => [{ fibers: [{ _disposables: disposables }] }] }
    const teardown = new AgentTeardown(deps({ registry, agents: agentsOf(['s1']) }))

    await expect(teardown.teardown('s1')).rejects.toThrow('handle close failed')
    await expect(teardown.teardown('s1')).rejects.toThrow(/cannot be torn down twice/)

    // The same shape reached without a prior teardown is still the host's.
    const fresh = new AgentTeardown(deps({ agents: agentsOf(['s1']) }))
    await expect(fresh.teardown('s1')).rejects.toThrow(/effect labels changed/)
  })

  it('collapses concurrent teardowns of one session into a single disposer call', async () => {
    const agents = agentsOf(['s1'])
    const body = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      agents.retire('s1')
    })
    const teardown = new AgentTeardown(
      deps({ registry: registryOf(wrapper('agentLoop.lifecycle(s1)', body)), agents }),
    )
    const [a, b] = await Promise.all([teardown.teardown('s1'), teardown.teardown('s1')])
    expect(a).toEqual({ kind: 'disposed' })
    expect(b).toEqual({ kind: 'disposed' })
    expect(body).toHaveBeenCalledTimes(1)
  })

  it('clears the in-flight entry so a later teardown sees the disposed state', async () => {
    const agents = agentsOf(['s1'])
    // cordis drops a disposer from `_disposables` once it has run.
    const disposables: unknown[] = []
    const effect = wrapper('agentLoop.lifecycle(s1)', () => {
      disposables.length = 0
      agents.retire('s1')
    })
    disposables.push(effect)
    const registry = { values: () => [{ fibers: [{ _disposables: disposables }] }] }
    const teardown = new AgentTeardown(deps({ registry, agents }))
    await expect(teardown.teardown('s1')).resolves.toEqual({ kind: 'disposed' })
    await expect(teardown.teardown('s1')).resolves.toEqual({ kind: 'not-running' })
  })

  it('propagates a disposer failure', async () => {
    const teardown = new AgentTeardown(
      deps({
        registry: registryOf(wrapper('agentLoop.lifecycle(s1)', () => Promise.reject(new Error('handle close failed')))),
        agents: agentsOf(['s1']),
      }),
    )
    await expect(teardown.teardown('s1')).rejects.toThrow('handle close failed')
  })
})

describe('AgentTeardown.runningSessionIds', () => {
  it('lists the root agents the public registry reports', () => {
    const teardown = new AgentTeardown(deps({ agents: agentsOf(['a', 'b']) }))
    expect([...teardown.runningSessionIds()].sort()).toEqual(['a', 'b'])
  })

  /**
   * A subagent's agent is owned by the parent that spawned it and is released
   * by the parent's own teardown. Offering it separately would let a user
   * dispose a child out from under a parent still awaiting its result.
   */
  it('leaves subagents out of the target set', () => {
    const teardown = new AgentTeardown(deps({ agents: agentsOf(['parent'], ['child']) }))
    expect(teardown.runningSessionIds()).toEqual(['parent'])
  })

  it('falls back to the effect labels when ctx.agents is not mounted', () => {
    const registry = registryOf(wrapper('agentLoop.lifecycle(a)'), wrapper('agentLoop.resume(main)'))
    const teardown = new AgentTeardown(deps({ registry, agents: undefined }))
    expect(teardown.runningSessionIds()).toEqual(['a'])
  })
})

describe('AgentTeardown.teardownEach', () => {
  it('reports one outcome per requested session and keeps going after a failure', async () => {
    const agents = agentsOf(['ok', 'broken'])
    const registry = registryOf(
      wrapper('agentLoop.lifecycle(ok)', () => agents.retire('ok')),
      wrapper('agentLoop.lifecycle(broken)', () => Promise.reject(new Error('stuck'))),
    )
    const outcomes = await new AgentTeardown(deps({ registry, agents })).teardownEach(['broken', 'ok'])
    expect(outcomes.map((outcome) => outcome.id)).toEqual(['broken', 'ok'])
    expect(outcomes.find((outcome) => outcome.id === 'ok')).toEqual({ id: 'ok', ok: true })
    expect(outcomes.find((outcome) => outcome.id === 'broken')).toMatchObject({
      ok: false,
      code: 'teardown-effect-missing',
    })
  })

  it('reports success for an id with no live agent, because the end state already holds', async () => {
    const outcomes = await new AgentTeardown(deps()).teardownEach(['cold'])
    expect(outcomes).toEqual([{ id: 'cold', ok: true }])
  })

  it('does nothing when asked for nothing', async () => {
    await expect(new AgentTeardown(deps()).teardownEach([])).resolves.toEqual([])
  })

  /**
   * DSH exits the process on any unhandled rejection, and teardown drives host
   * machinery through a transition its authors never exercise. The batch is
   * the only place that can say which session was in hand when one surfaced.
   */
  it('attributes an unhandled rejection to the session being torn down', async () => {
    const listeners: ((reason: unknown) => void)[] = []
    const proc = {
      prependListener: (_event: 'unhandledRejection', listener: (reason: unknown) => void) => listeners.push(listener),
      off: (_event: 'unhandledRejection', listener: (reason: unknown) => void) =>
        listeners.splice(listeners.indexOf(listener), 1),
    }
    const lines: string[] = []
    const agents = agentsOf(['slow'])
    const registry = registryOf(
      wrapper('agentLoop.lifecycle(slow)', () => {
        for (const listener of listeners) listener(new Error('stranded'))
        agents.retire('slow')
      }),
    )
    const teardown = new AgentTeardown({
      registry,
      agents,
      logger: {
        error: (line: string) => {
          lines.push(line)
        },
      },
      process: proc,
    })

    await teardown.teardownEach(['slow'])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('session "slow"')
    expect(lines[0]).toContain('stranded')
    // Observing the process outside a batch is not this plugin's business.
    expect(listeners).toHaveLength(0)
  })
})
