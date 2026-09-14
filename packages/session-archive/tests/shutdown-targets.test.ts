/**
 * The archive area's target rule.
 *
 * The exclusion is the difference between "close what is running in the
 * background" and "close everything, including the thing you are reading",
 * so it is worth pinning apart from the surface that applies it.
 */

import { describe, expect, it } from 'vitest'

import type { RunningSession } from '../src/contract.js'
import { backgroundTargets } from '../src/client/shutdown/targets.js'

/** A running session with only the fields the rule looks at. */
const running = (id: string, title?: string): RunningSession => ({ id, title, cwd: undefined, blank: false })

describe('backgroundTargets', () => {
  it('leaves out the session the browser is showing', () => {
    const targets = backgroundTargets([running('a'), running('b'), running('c')], 'b')
    expect(targets.map((target) => target.id)).toEqual(['a', 'c'])
  })

  it('keeps every session when nothing is open', () => {
    const targets = backgroundTargets([running('a'), running('b')], undefined)
    expect(targets.map((target) => target.id)).toEqual(['a', 'b'])
  })

  it('yields nothing when the only running session is the open one', () => {
    expect(backgroundTargets([running('a')], 'a')).toEqual([])
  })

  it('preserves the order the host listed', () => {
    const targets = backgroundTargets([running('c'), running('a'), running('b')], undefined)
    expect(targets.map((target) => target.id)).toEqual(['c', 'a', 'b'])
  })

  it('labels a session with its title', () => {
    expect(backgroundTargets([running('a', '重构归档区')], undefined)[0]?.label).toBe('重构归档区')
  })

  it('falls back to a readable label rather than showing a bare id', () => {
    const [target] = backgroundTargets([running('a')], undefined)
    expect(target?.label).not.toBe('')
    expect(target?.label).not.toBe('a')
  })
})
