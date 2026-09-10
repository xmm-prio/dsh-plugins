import { describe, expect, it, vi } from 'vitest'

import { AgentTeardown, TeardownShapeError } from '../src/host/agent-teardown.js'
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

function agentsOf(ids: string[]) {
  const live = new Set(ids)
  return {
    get: (id: string) => (live.has(id) ? { id } : undefined),
    list: () => [...live].map((id) => ({ id })),
    retire: (id: string) => live.delete(id),
  }
}

describe('AgentTeardown.teardown', () => {
  it('runs the host disposer for a live agent and confirms it deregistered', async () => {
    const agents = agentsOf(['s1'])
    const body = vi.fn(() => {
      agents.retire('s1')
    })
    const teardown = new AgentTeardown({ registry: registryOf(wrapper('agentLoop.lifecycle(s1)', body)), agents })
    await expect(teardown.teardown('s1')).resolves.toEqual({ kind: 'disposed' })
    expect(body).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for a cold session', async () => {
    const teardown = new AgentTeardown({ registry: registryOf(), agents: agentsOf([]) })
    await expect(teardown.teardown('s1')).resolves.toEqual({ kind: 'not-running' })
  })

  it('fails loudly when a live agent has no lifecycle effect', async () => {
    const teardown = new AgentTeardown({ registry: registryOf(), agents: agentsOf(['s1']) })
    await expect(teardown.teardown('s1')).rejects.toBeInstanceOf(TeardownShapeError)
    await expect(teardown.teardown('s1')).rejects.toThrow(/effect labels changed/)
  })

  it('never mistakes the agentLoop.resume decoy for a lifecycle effect', async () => {
    const teardown = new AgentTeardown({
      registry: registryOf(wrapper('agentLoop.resume(s1)'), wrapper('agentLoop.resume-load(s1)')),
      agents: agentsOf(['s1']),
    })
    await expect(teardown.teardown('s1')).rejects.toThrow(/no "agentLoop.lifecycle" effect/)
  })

  it('refuses to guess when two effects carry the same session', async () => {
    const registry: RegistryLike = {
      values: () => [
        { fibers: [{ _disposables: [wrapper('agentLoop.lifecycle(s1)')] }] },
        { fibers: [{ _disposables: [wrapper('agentLoop.lifecycle(s1)')] }] },
      ],
    }
    const teardown = new AgentTeardown({ registry, agents: agentsOf(['s1']) })
    await expect(teardown.teardown('s1')).rejects.toThrow(/refusing to guess/)
  })

  it('fails when the disposer ran but the agent is still registered', async () => {
    const teardown = new AgentTeardown({
      registry: registryOf(wrapper('agentLoop.lifecycle(s1)')),
      agents: agentsOf(['s1']),
    })
    await expect(teardown.teardown('s1')).rejects.toThrow(/still registered/)
  })

  it('collapses concurrent teardowns of one session into a single disposer call', async () => {
    const agents = agentsOf(['s1'])
    const body = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      agents.retire('s1')
    })
    const teardown = new AgentTeardown({ registry: registryOf(wrapper('agentLoop.lifecycle(s1)', body)), agents })
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
    const teardown = new AgentTeardown({ registry, agents })
    await expect(teardown.teardown('s1')).resolves.toEqual({ kind: 'disposed' })
    await expect(teardown.teardown('s1')).resolves.toEqual({ kind: 'not-running' })
  })

  it('propagates a disposer failure', async () => {
    const teardown = new AgentTeardown({
      registry: registryOf(
        wrapper('agentLoop.lifecycle(s1)', () => Promise.reject(new Error('handle close failed'))),
      ),
      agents: agentsOf(['s1']),
    })
    await expect(teardown.teardown('s1')).rejects.toThrow('handle close failed')
  })
})

describe('AgentTeardown.liveSessionIds', () => {
  it('prefers the public agent registry', () => {
    const teardown = new AgentTeardown({ registry: registryOf(), agents: agentsOf(['a', 'b']) })
    expect([...teardown.liveSessionIds()].sort()).toEqual(['a', 'b'])
  })

  it('falls back to the effect labels when ctx.agents is not mounted', () => {
    const registry = registryOf(wrapper('agentLoop.lifecycle(a)'), wrapper('agentLoop.resume(main)'))
    const teardown = new AgentTeardown({ registry, agents: undefined })
    expect(teardown.liveSessionIds()).toEqual(['a'])
  })
})

describe('AgentTeardown.teardownAll', () => {
  it('reports one outcome per live session and keeps going after a failure', async () => {
    const agents = agentsOf(['ok', 'broken'])
    const registry = registryOf(
      wrapper('agentLoop.lifecycle(ok)', () => agents.retire('ok')),
      wrapper('agentLoop.lifecycle(broken)', () => Promise.reject(new Error('stuck'))),
    )
    const outcomes = await new AgentTeardown({ registry, agents }).teardownAll()
    expect(outcomes).toHaveLength(2)
    expect(outcomes.find((outcome) => outcome.id === 'ok')).toEqual({ id: 'ok', ok: true })
    const broken = outcomes.find((outcome) => outcome.id === 'broken')
    expect(broken).toMatchObject({ ok: false, code: 'teardown-effect-missing' })
  })

  it('does nothing when no agent is live', async () => {
    const teardown = new AgentTeardown({ registry: registryOf(), agents: agentsOf([]) })
    await expect(teardown.teardownAll()).resolves.toEqual([])
  })
})
