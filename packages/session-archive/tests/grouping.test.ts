import { describe, expect, it } from 'vitest'

import { groupSessions, planBulkArchive, sessionVisible } from '../src/domain/grouping.js'
import type { SessionListEntry, WorkspaceLedger } from '../src/domain/grouping.js'

function session(id: string, extra: Partial<SessionListEntry> = {}): SessionListEntry {
  return { id, blank: false, ...extra }
}

function ledger(workspaceId: string, sessionIds: string[]): WorkspaceLedger {
  return { workspaceId, sessionIds }
}

describe('sessionVisible', () => {
  it('hides subagent sessions', () => {
    expect(sessionVisible(session('a', { origin: 'subagent' }), undefined, new Set())).toBe(false)
  })

  it('hides archived sessions', () => {
    expect(sessionVisible(session('a'), undefined, new Set(['a']))).toBe(false)
  })

  it('hides a blank session that is not the current one', () => {
    expect(sessionVisible(session('a', { blank: true }), 'b', new Set())).toBe(false)
  })

  it('shows the currently selected blank session', () => {
    expect(sessionVisible(session('a', { blank: true }), 'a', new Set())).toBe(true)
  })

  it('still hides the currently selected blank session once archived', () => {
    expect(sessionVisible(session('a', { blank: true }), 'a', new Set(['a']))).toBe(false)
  })

  it('shows an ordinary session', () => {
    expect(sessionVisible(session('a'), undefined, new Set())).toBe(true)
  })
})

describe('groupSessions', () => {
  it('accounts a session to its workspace before judging visibility', () => {
    const grouping = groupSessions({
      sessions: [session('a'), session('b')],
      workspaces: [ledger('w1', ['a'])],
      archived: new Set(['a']),
      current: undefined,
    })
    expect(grouping.workspaces).toEqual([{ workspaceId: 'w1', accounted: ['a'], visible: [] }])
    expect(grouping.ungrouped.accounted).toEqual(['b'])
  })

  it('never lets an archived ledger member fall into ungrouped', () => {
    const grouping = groupSessions({
      sessions: [session('a')],
      workspaces: [ledger('w1', ['a'])],
      archived: new Set(['a']),
      current: undefined,
    })
    expect(grouping.ungrouped.accounted).toEqual([])
    expect(grouping.ungrouped.visible).toEqual([])
  })

  it('ignores ledger entries with no matching session', () => {
    const grouping = groupSessions({
      sessions: [session('a')],
      workspaces: [ledger('w1', ['a', 'ghost'])],
      archived: new Set(),
      current: undefined,
    })
    expect(grouping.workspaces[0]!.accounted).toEqual(['a'])
  })

  it('accounts a session shared by two ledgers only to the first', () => {
    const grouping = groupSessions({
      sessions: [session('a')],
      workspaces: [ledger('w1', ['a']), ledger('w2', ['a'])],
      archived: new Set(),
      current: undefined,
    })
    expect(grouping.workspaces[0]!.visible).toEqual(['a'])
    expect(grouping.workspaces[1]!.visible).toEqual(['a'])
    expect(grouping.ungrouped.accounted).toEqual([])
  })

  it('places an unledgered session into ungrouped', () => {
    const grouping = groupSessions({
      sessions: [session('a'), session('b')],
      workspaces: [ledger('w1', ['a'])],
      archived: new Set(),
      current: undefined,
    })
    expect(grouping.ungrouped.visible).toEqual(['b'])
  })

  it('keeps a subagent stray out of the visible ungrouped list but still reports it', () => {
    const grouping = groupSessions({
      sessions: [session('s', { origin: 'subagent' })],
      workspaces: [],
      archived: new Set(),
      current: undefined,
    })
    expect(grouping.ungrouped.accounted).toEqual(['s'])
    expect(grouping.ungrouped.visible).toEqual([])
  })
})

describe('planBulkArchive', () => {
  const base = {
    sessions: [
      session('live'),
      session('blank', { blank: true }),
      session('sub', { origin: 'subagent' }),
      session('done'),
      session('stray'),
    ],
    workspaces: [ledger('w1', ['live', 'blank', 'sub', 'done'])],
    archived: new Set(['done']),
    current: undefined,
  }

  it('archives exactly the archivable members of a workspace', () => {
    const plan = planBulkArchive({ ...base, scope: { kind: 'workspace', workspaceId: 'w1' } })
    expect(plan.targets).toEqual(['live'])
    expect(plan.skipped).toEqual([
      { id: 'blank', reason: 'blank' },
      { id: 'sub', reason: 'subagent' },
      { id: 'done', reason: 'already-archived' },
    ])
  })

  it('skips the currently selected blank session even though the sidebar shows it', () => {
    const plan = planBulkArchive({
      ...base,
      current: 'blank',
      scope: { kind: 'workspace', workspaceId: 'w1' },
    })
    expect(plan.targets).toEqual(['live'])
    expect(plan.skipped).toContainEqual({ id: 'blank', reason: 'blank' })
  })

  it('archives the ungrouped complement of every ledger', () => {
    const plan = planBulkArchive({ ...base, scope: { kind: 'ungrouped' } })
    expect(plan.targets).toEqual(['stray'])
    expect(plan.skipped).toEqual([])
  })

  it('reports an unknown workspace rather than silently archiving nothing', () => {
    const plan = planBulkArchive({ ...base, scope: { kind: 'workspace', workspaceId: 'nope' } })
    expect(plan.unknownScope).toBe(true)
    expect(plan.targets).toEqual([])
  })

  it('classifies an archived subagent stray under its first matching reason', () => {
    const plan = planBulkArchive({
      sessions: [session('s', { origin: 'subagent' })],
      workspaces: [],
      archived: new Set(['s']),
      current: undefined,
      scope: { kind: 'ungrouped' },
    })
    expect(plan.skipped).toEqual([{ id: 's', reason: 'subagent' }])
  })
})
