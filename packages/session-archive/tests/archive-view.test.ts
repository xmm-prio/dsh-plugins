import { describe, expect, it } from 'vitest'

import { buildArchiveView, entryLabel } from '../src/domain/archive-view.js'
import type { ArchivedSessionEntry } from '../src/contract.js'

function entry(id: string, extra: Partial<ArchivedSessionEntry> = {}): ArchivedSessionEntry {
  return {
    id,
    title: undefined,
    createdAt: 1_000,
    lastActivityAt: undefined,
    sizeBytes: undefined,
    cwd: undefined,
    workspaceId: undefined,
    workspaceTitle: undefined,
    ...extra,
  }
}

describe('entryLabel', () => {
  it('uses the resolved title when there is one', () => {
    expect(entryLabel(entry('s1', { title: '重构侧栏' }))).toBe('重构侧栏')
  })

  it('degrades to the session id, which is what the row shows', () => {
    expect(entryLabel(entry('s1'))).toBe('s1')
  })
})

describe('buildArchiveView grouping', () => {
  it('puts each workspace in its own group and everything else in one bucket', () => {
    const view = buildArchiveView(
      [
        entry('a', { workspaceId: 'w1', workspaceTitle: '甲', lastActivityAt: 30 }),
        entry('b', { workspaceId: 'w2', workspaceTitle: '乙', lastActivityAt: 20 }),
        entry('c', { lastActivityAt: 10 }),
        entry('d', { workspaceId: 'w1', workspaceTitle: '甲', lastActivityAt: 40 }),
        entry('e', { lastActivityAt: 50 }),
      ],
      '',
    )
    expect(view.groups.map((group) => group.workspaceId)).toEqual(['w1', 'w2', undefined])
    expect(view.groups[0]?.entries.map((item) => item.id)).toEqual(['d', 'a'])
    expect(view.groups[2]?.entries.map((item) => item.id)).toEqual(['e', 'c'])
  })

  it('keeps the ungrouped bucket last however recent it is', () => {
    const view = buildArchiveView(
      [entry('old', { workspaceId: 'w1', lastActivityAt: 1 }), entry('new', { lastActivityAt: 9_999 })],
      '',
    )
    expect(view.groups.map((group) => group.workspaceId)).toEqual(['w1', undefined])
  })

  it('orders workspaces by their most recent session', () => {
    const view = buildArchiveView(
      [
        entry('a', { workspaceId: 'stale', lastActivityAt: 10 }),
        entry('b', { workspaceId: 'fresh', lastActivityAt: 90 }),
      ],
      '',
    )
    expect(view.groups.map((group) => group.workspaceId)).toEqual(['fresh', 'stale'])
  })

  it('dates a session by its creation time when nothing else is known', () => {
    const view = buildArchiveView(
      [entry('a', { createdAt: 5 }), entry('b', { createdAt: 50 })],
      '',
    )
    expect(view.groups[0]?.entries.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('sums only the sizes the backend reported', () => {
    const view = buildArchiveView(
      [entry('a', { sizeBytes: 100 }), entry('b'), entry('c', { sizeBytes: 23 })],
      '',
    )
    expect(view.groups[0]?.sizeBytes).toBe(123)
  })

  it('titles a group from its members rather than needing a workspace list', () => {
    const view = buildArchiveView([entry('a', { workspaceId: 'w1', workspaceTitle: '甲' })], '')
    expect(view.groups[0]?.title).toBe('甲')
  })
})

describe('buildArchiveView search', () => {
  const entries = [
    entry('s1', { title: '重构侧栏', workspaceId: 'w1' }),
    entry('s2', { title: 'Refactor Sidebar', workspaceId: 'w1' }),
    entry('deadbeef'),
  ]

  it('shows everything and hides nothing for a blank query', () => {
    const view = buildArchiveView(entries, '   ')
    expect(view.hidden).toBe(0)
    expect(view.groups.flatMap((group) => group.entries)).toHaveLength(3)
  })

  it('matches a substring of the title', () => {
    const view = buildArchiveView(entries, '侧栏')
    expect(view.groups.flatMap((group) => group.entries.map((item) => item.id))).toEqual(['s1'])
    expect(view.hidden).toBe(2)
  })

  it('ignores case', () => {
    const view = buildArchiveView(entries, 'REFACTOR')
    expect(view.groups.flatMap((group) => group.entries.map((item) => item.id))).toEqual(['s2'])
  })

  it('matches the id for a session whose title never resolved', () => {
    const view = buildArchiveView(entries, 'deadb')
    expect(view.groups.flatMap((group) => group.entries.map((item) => item.id))).toEqual(['deadbeef'])
  })

  it('drops a group whose every member was filtered out', () => {
    const view = buildArchiveView(entries, 'deadb')
    expect(view.groups.map((group) => group.workspaceId)).toEqual([undefined])
  })

  it('returns no groups at all when nothing matches', () => {
    const view = buildArchiveView(entries, 'nothing here')
    expect(view.groups).toEqual([])
    expect(view.hidden).toBe(3)
  })

  it('sizes a group from the matches, not from the whole workspace', () => {
    const view = buildArchiveView(
      [
        entry('a', { title: 'keep', workspaceId: 'w1', sizeBytes: 10 }),
        entry('b', { title: 'drop', workspaceId: 'w1', sizeBytes: 90 }),
      ],
      'keep',
    )
    expect(view.groups[0]?.sizeBytes).toBe(10)
  })
})
