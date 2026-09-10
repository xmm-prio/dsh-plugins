/**
 * @vitest-environment jsdom
 *
 * Recognition of the built-in sidebar's rows.
 *
 * The fixture below is the shape measured on a rendered `0.1.5-rc.1` sidebar,
 * including the two details a static read of the shipped bundle got wrong: the
 * session rows under a group carry the *same* mangled `rowActions` class as the
 * project rows, and `props.group` sits at a different fiber depth for a
 * workspace row than for the ungrouped row.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { INJECTED_ATTRIBUTE, readRowGroup, scanRows } from '../src/client/sidebar/adapter.js'

/** The per-build random suffix React stamps onto every host node. */
const FIBER_KEY = '__reactFiber$zq31k7m9x'

interface Fiber {
  memoizedProps?: Record<string, unknown>
  return?: Fiber | undefined
}

/** Attach a fiber chain to an element, innermost first. React assigns it plainly. */
function attachFiber(element: Element, ...chain: Record<string, unknown>[]): void {
  let head: Fiber | undefined
  for (const props of [...chain].reverse()) head = { memoizedProps: props, return: head }
  ;(element as unknown as Record<string, Fiber | undefined>)[FIBER_KEY] = head
}

/** The group object `deriveGroups` constructs for a workspace. */
function workspaceGroup(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: 'ws-1',
    workspaceId: 'ws-1',
    cwd: '/tmp/alpha',
    createdAt: 1,
    label: '工作区 Alpha',
    sessionCount: 3,
    expanded: false,
    containsCurrent: false,
    sessions: [],
    ...overrides,
  }
}

/** The group object `deriveGroups` constructs for the ungrouped row. */
function ungroupedGroup(sessionCount = 2): Record<string, unknown> {
  return {
    key: '',
    workspaceId: undefined,
    cwd: undefined,
    createdAt: undefined,
    label: '',
    sessionCount,
    expanded: false,
    containsCurrent: false,
    sessions: [],
  }
}

/**
 * Build a row the way the host renders it.
 *
 * A workspace row nests two levels of tooltip chrome between the row element
 * and `ProjectRowItem`, and its action strip carries a menu before the "+";
 * the ungrouped row has neither.
 */
function projectRow(group: Record<string, unknown>, kind: 'workspace' | 'ungrouped'): HTMLElement {
  const row = document.createElement('div')
  row.className = 'YDXeBa_projectRow'
  const actions = document.createElement('span')
  actions.className = 'YDXeBa_rowActions'
  if (kind === 'workspace') {
    const menu = document.createElement('span')
    menu.className = 'Menu_root'
    actions.append(menu)
  }
  const plus = document.createElement('button')
  plus.className = 'YDXeBa_iconButton'
  actions.append(plus)
  row.append(document.createElement('span'), actions)

  if (kind === 'workspace') {
    attachFiber(row, { className: 'YDXeBa_projectRow' }, { className: 'tooltipTrigger' }, { anchor: {} }, { group })
  } else {
    attachFiber(row, { className: 'YDXeBa_projectRow' }, { group })
  }
  return row
}

/** A session row inside an expanded group: same `rowActions` class, no group. */
function sessionRow(): HTMLElement {
  const row = document.createElement('div')
  row.className = 'YDXeBa_sessionRow'
  const actions = document.createElement('span')
  actions.className = 'YDXeBa_rowActions'
  actions.append(document.createElement('button'))
  row.append(actions)
  attachFiber(row, { className: 'YDXeBa_sessionRow' }, { session: { id: 's-1' } })
  return row
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('readRowGroup', () => {
  it('finds the group three fiber levels above a workspace row', () => {
    const row = projectRow(workspaceGroup(), 'workspace')
    expect(readRowGroup(row)).toEqual({ workspaceId: 'ws-1', label: '工作区 Alpha', sessionCount: 3 })
  })

  it('finds the group one fiber level above the ungrouped row', () => {
    const row = projectRow(ungroupedGroup(), 'ungrouped')
    expect(readRowGroup(row)).toEqual({ workspaceId: undefined, label: '', sessionCount: 2 })
  })

  it('reports nothing when the element carries no fiber', () => {
    const row = document.createElement('div')
    expect(readRowGroup(row)).toBeUndefined()
  })

  it('reports nothing when the group is beyond the bounded walk', () => {
    const row = document.createElement('div')
    attachFiber(row, ...Array.from({ length: 9 }, () => ({})), { group: workspaceGroup() })
    expect(readRowGroup(row)).toBeUndefined()
  })

  it.each([
    ['key is not a string', { key: 7 }],
    ['sessionCount is missing', { sessionCount: undefined }],
    ['expanded is not a boolean', { expanded: 'yes' }],
    ['label is not a string', { label: undefined }],
    ['workspaceId is neither string nor undefined', { workspaceId: 42 }],
  ])('refuses a group whose %s', (_case, overrides) => {
    const row = projectRow(workspaceGroup(overrides), 'ungrouped')
    expect(readRowGroup(row)).toBeUndefined()
  })
})

describe('scanRows', () => {
  it('recognizes a workspace row and the ungrouped row alike', () => {
    document.body.append(projectRow(workspaceGroup(), 'workspace'), projectRow(ungroupedGroup(), 'ungrouped'))
    const scan = scanRows(document)
    expect(scan.unrecognized).toBe(0)
    expect(scan.rows.map((row) => row.group.workspaceId)).toEqual(['ws-1', undefined])
  })

  it('anchors on the trailing "+" button, after the menu when there is one', () => {
    document.body.append(projectRow(workspaceGroup(), 'workspace'), projectRow(ungroupedGroup(), 'ungrouped'))
    for (const row of scanRows(document).rows) {
      expect(row.anchor.tagName).toBe('BUTTON')
      expect(row.anchor).toBe(row.actions.lastElementChild)
    }
  })

  it('leaves session rows alone even though they share the rowActions class', () => {
    const row = projectRow(workspaceGroup({ expanded: true }), 'workspace')
    document.body.append(row, sessionRow(), sessionRow())
    const scan = scanRows(document)
    expect(scan.rows).toHaveLength(1)
    // Session rows are not project rows, so they are not failures either.
    expect(scan.unrecognized).toBe(0)
  })

  it('counts a row whose fiber no longer carries a group as unrecognized', () => {
    const row = projectRow(workspaceGroup(), 'workspace')
    attachFiber(row, { className: 'YDXeBa_projectRow' })
    document.body.append(row)
    expect(scanRows(document)).toMatchObject({ rows: [], unrecognized: 1 })
  })

  it('counts a row whose action strip moved out of reach as unrecognized', () => {
    const row = projectRow(workspaceGroup(), 'workspace')
    const actions = row.querySelector('[class*="_rowActions"]')!
    // An upstream refactor that wraps the strip one level deeper.
    const wrapper = document.createElement('div')
    row.append(wrapper)
    wrapper.append(actions)
    document.body.append(row)
    expect(scanRows(document)).toMatchObject({ rows: [], unrecognized: 1 })
  })

  it('counts a row whose action strip lost its "+" button as unrecognized', () => {
    const row = projectRow(ungroupedGroup(), 'ungrouped')
    row.querySelector('[class*="_rowActions"]')!.replaceChildren(document.createElement('span'))
    document.body.append(row)
    expect(scanRows(document)).toMatchObject({ rows: [], unrecognized: 1 })
  })

  it('reports neither rows nor failures when the mangled class changes wholesale', () => {
    const row = projectRow(workspaceGroup(), 'workspace')
    row.className = 'Zz9Qw_projectLine'
    document.body.append(row)
    expect(scanRows(document)).toEqual({ rows: [], unrecognized: 0 })
  })

  it('never adopts an already-injected node as the anchor', () => {
    const row = projectRow(ungroupedGroup(), 'ungrouped')
    const actions = row.querySelector('[class*="_rowActions"]')!
    const mine = document.createElement('button')
    mine.setAttribute(INJECTED_ATTRIBUTE, '0.1.5-rc.1')
    actions.append(mine)
    document.body.append(row)
    expect(scanRows(document).rows[0]?.anchor).not.toBe(mine)
  })
})
