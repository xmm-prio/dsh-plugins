import { describe, expect, it, vi } from 'vitest'

import {
  agentLifecycleLabel,
  findAgentLifecycleEffects,
  listLiveAgentSessionIds,
  probeEffectScan,
  runEffectDisposer,
  scanLabelledEffects,
  sessionIdFromLifecycleLabel,
} from '../src/host/internals/agent-effects.js'
import type { RegistryLike } from '../src/host/internals/agent-effects.js'

const EFFECT = Symbol.for('cordis.effect')

/** Build a disposer shaped like a real cordis effect wrapper, including its thenable trap. */
function wrapper(label: string | undefined, body: () => unknown = () => undefined) {
  const fn = Object.assign(() => body(), {
    // cordis wrappers are PromiseLike: `await wrapper` resolves to the inner
    // disposeAsync function without running a single disposer.
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(onFulfilled(function disposeAsync() {})),
  })
  if (label !== undefined) Object.defineProperty(fn, EFFECT, { value: { label, children: [] } })
  return fn
}

/** Minimal stand-in for `ctx.registry` over a nested list of disposables. */
function registry(fiberDisposables: unknown[][]): RegistryLike {
  return {
    values: () => [{ fibers: fiberDisposables.map((disposables) => ({ _disposables: disposables })) }],
  }
}

describe('agentLifecycleLabel', () => {
  it('composes the exact label agent-loop emits', () => {
    expect(agentLifecycleLabel('sess-1')).toBe('agentLoop.lifecycle(sess-1)')
  })

  it('round-trips through the label parser', () => {
    expect(sessionIdFromLifecycleLabel(agentLifecycleLabel('sess-1'))).toBe('sess-1')
  })

  it('does not parse the resume label, whose id is a configured agent id', () => {
    expect(sessionIdFromLifecycleLabel('agentLoop.resume(main)')).toBeUndefined()
    expect(sessionIdFromLifecycleLabel('agentLoop.resume-load(main)')).toBeUndefined()
    expect(sessionIdFromLifecycleLabel('agentLoop.transactions()')).toBeUndefined()
  })
})

describe('scanLabelledEffects', () => {
  it('collects labelled wrappers across every fiber', () => {
    const found = scanLabelledEffects(
      registry([[wrapper('a')], [wrapper('b'), wrapper(undefined), 'not-a-function']]),
    )
    expect(found.map((effect) => effect.label)).toEqual(['a', 'b'])
  })

  it('tolerates runtimes with no fibers and fibers with no disposables', () => {
    const sparse: RegistryLike = {
      values: () => [{}, { fibers: [{}, { _disposables: [wrapper('a')] }] }],
    }
    expect(scanLabelledEffects(sparse).map((effect) => effect.label)).toEqual(['a'])
  })

  it('reads nested effects that stayed at the top level of the list', () => {
    const found = scanLabelledEffects(registry([[wrapper('outer.parent'), wrapper('inner.child')]]))
    expect(found.map((effect) => effect.label)).toEqual(['outer.parent', 'inner.child'])
  })

  it('ignores a disposer whose effect metadata is malformed', () => {
    const broken = Object.assign(() => {}, {})
    Object.defineProperty(broken, EFFECT, { value: { label: 42 } })
    const alsoBroken = Object.assign(() => {}, {})
    Object.defineProperty(alsoBroken, EFFECT, { value: null })
    expect(scanLabelledEffects(registry([[broken, alsoBroken]]))).toEqual([])
  })

  it('walks a DisposableList that offers only Symbol.iterator', () => {
    const list = { *[Symbol.iterator]() { yield wrapper('a') } }
    const source: RegistryLike = { values: () => [{ fibers: [{ _disposables: list }] }] }
    expect(scanLabelledEffects(source).map((effect) => effect.label)).toEqual(['a'])
  })
})

describe('findAgentLifecycleEffects', () => {
  it('matches the lifecycle label as a whole string', () => {
    const found = findAgentLifecycleEffects(registry([[wrapper('agentLoop.lifecycle(sess-1)')]]), 'sess-1')
    expect(found).toHaveLength(1)
  })

  it('never matches the agentLoop.resume decoy carrying a configured agent id', () => {
    const decoys = registry([
      [
        wrapper('agentLoop.resume(sess-1)'),
        wrapper('agentLoop.resume-load(sess-1)'),
        wrapper('agentLoop.transactions()'),
        wrapper('agentLoop.setFactory()'),
      ],
    ])
    expect(findAgentLifecycleEffects(decoys, 'sess-1')).toEqual([])
  })

  it('does not match a session id that merely prefixes another', () => {
    const found = findAgentLifecycleEffects(registry([[wrapper('agentLoop.lifecycle(sess-10)')]]), 'sess-1')
    expect(found).toEqual([])
  })

  it('reports every duplicate rather than silently taking the first', () => {
    const dupes = registry([[wrapper('agentLoop.lifecycle(s)')], [wrapper('agentLoop.lifecycle(s)')]])
    expect(findAgentLifecycleEffects(dupes, 's')).toHaveLength(2)
  })
})

describe('listLiveAgentSessionIds', () => {
  it('lists lifecycle sessions and skips every other label', () => {
    const source = registry([
      [
        wrapper('agentLoop.lifecycle(a)'),
        wrapper('agentLoop.resume(main)'),
        wrapper('workspace.domainClose'),
        wrapper('agentLoop.lifecycle(b)'),
      ],
    ])
    expect(listLiveAgentSessionIds(source).sort()).toEqual(['a', 'b'])
  })

  it('deduplicates a session seen on two fibers', () => {
    const source = registry([[wrapper('agentLoop.lifecycle(a)')], [wrapper('agentLoop.lifecycle(a)')]])
    expect(listLiveAgentSessionIds(source)).toEqual(['a'])
  })
})

describe('runEffectDisposer', () => {
  it('invokes the wrapper instead of awaiting it', async () => {
    const body = vi.fn(async () => {})
    const effect = { label: 'agentLoop.lifecycle(a)', wrapper: wrapper('agentLoop.lifecycle(a)', body) }
    await runEffectDisposer(effect)
    expect(body).toHaveBeenCalledTimes(1)
  })

  it('propagates a disposer failure unchanged', async () => {
    const boom = new Error('handle close failed')
    const effect = {
      label: 'agentLoop.lifecycle(a)',
      wrapper: wrapper('agentLoop.lifecycle(a)', () => Promise.reject(boom)),
    }
    await expect(runEffectDisposer(effect)).rejects.toBe(boom)
  })

  it('awaiting the bare wrapper would have run nothing — the trap this guards', async () => {
    const body = vi.fn(async () => {})
    const bare = wrapper('agentLoop.lifecycle(a)', body)
    const resolved = await bare
    expect(typeof resolved).toBe('function')
    expect(body).not.toHaveBeenCalled()
  })
})

describe('probeEffectScan', () => {
  it('accepts the real enumeration surface', () => {
    expect(probeEffectScan(registry([[wrapper('a')]]))).toBe(true)
  })

  it('accepts a registry that has no fibers with disposables yet', () => {
    expect(probeEffectScan({ values: () => [] })).toBe(true)
  })

  it('rejects a registry with no values()', () => {
    expect(probeEffectScan({})).toBe(false)
    expect(probeEffectScan(null)).toBe(false)
    expect(probeEffectScan({ values: 'nope' })).toBe(false)
  })

  it('rejects non-iterable fibers or disposables', () => {
    expect(probeEffectScan({ values: () => [{ fibers: 7 }] })).toBe(false)
    expect(probeEffectScan({ values: () => [{ fibers: [{ _disposables: 7 }] }] })).toBe(false)
    expect(probeEffectScan({ values: () => [{ fibers: [{}] }] })).toBe(false)
  })

  it('rejects a values() that throws', () => {
    expect(
      probeEffectScan({
        values: () => {
          throw new Error('no')
        },
      }),
    ).toBe(false)
  })
})
