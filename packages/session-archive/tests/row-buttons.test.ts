/**
 * @vitest-environment jsdom
 *
 * Lifecycle of the buttons injected into the built-in sidebar's rows.
 *
 * Recognition is stubbed here so the subject is only what the injector does
 * with the answer: idempotent re-injection, re-labelling, removal of rows that
 * went away, the kill-switch, and teardown. Recognition itself is covered by
 * `sidebar-adapter.test.ts` against the measured DOM shape.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { INJECTED_ATTRIBUTE } from '../src/client/sidebar/adapter.js'
import type { RowGroup, RowScan } from '../src/client/sidebar/adapter.js'
import { createRowButtons } from '../src/client/sidebar/row-buttons.js'
import type { RowButtonCopy } from '../src/client/sidebar/row-buttons.js'

const copy: RowButtonCopy = {
  action: (group) => `archive ${String(group.sessionCount)} in ${group.workspaceId ?? 'ungrouped'}`,
  empty: (group) => `nothing in ${group.workspaceId ?? 'ungrouped'}`,
  busy: 'archiving',
}

/** Build one row element with an action strip ending in a "+" button. */
function row(id: string): HTMLElement {
  const element = document.createElement('div')
  element.dataset['row'] = id
  const actions = document.createElement('span')
  const plus = document.createElement('button')
  plus.className = 'host_iconButton'
  actions.append(plus)
  element.append(actions)
  document.body.append(element)
  return element
}

/** A scan result over the rows currently in the document. */
function scanOf(rows: readonly [HTMLElement, RowGroup][], unrecognized = 0): RowScan {
  return {
    unrecognized,
    rows: rows.map(([element, group]) => {
      const actions = element.firstElementChild!
      const anchor = [...actions.children].filter((child) => !child.hasAttribute(INJECTED_ATTRIBUTE)).at(-1)!
      return { row: element, actions, anchor, group }
    }),
  }
}

const alpha: RowGroup = { workspaceId: 'ws-alpha', label: 'Alpha', sessionCount: 3 }
const ungrouped: RowGroup = { workspaceId: undefined, label: '', sessionCount: 2 }

/** Every button this plugin owns, in document order. */
function injectedButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>(`[${INJECTED_ATTRIBUTE}]`)]
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('createRowButtons', () => {
  it('injects one button per row, immediately before the "+"', () => {
    const rows = [row('a'), row('b')]
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[rows[0]!, alpha], [rows[1]!, ungrouped]]),
      archive: async () => 'done',
      copy,
      warn: () => {},
    })
    buttons.sync()

    for (const element of rows) {
      const children = [...element.firstElementChild!.children]
      expect(children).toHaveLength(2)
      expect(children[0]!.hasAttribute(INJECTED_ATTRIBUTE)).toBe(true)
      expect(children[1]!.tagName).toBe('BUTTON')
    }
  })

  it('wears the host "+" button\'s own class so it needs no CSS of its own', () => {
    const element = row('a')
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, alpha]]),
      archive: async () => 'done',
      copy,
      warn: () => {},
    })
    buttons.sync()
    expect(injectedButtons()[0]!.className).toBe('host_iconButton')
  })

  it('is idempotent across repeated scans', () => {
    const element = row('a')
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, alpha]]),
      archive: async () => 'done',
      copy,
      warn: () => {},
    })
    buttons.sync()
    buttons.sync()
    buttons.sync()
    expect(injectedButtons()).toHaveLength(1)
  })

  it('re-labels a row whose session count changed', () => {
    const element = row('a')
    let group = alpha
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, group]]),
      archive: async () => 'done',
      copy,
      warn: () => {},
    })
    buttons.sync()
    expect(injectedButtons()[0]!.title).toBe('archive 3 in ws-alpha')

    group = { ...alpha, sessionCount: 1 }
    buttons.sync()
    expect(injectedButtons()[0]!.title).toBe('archive 1 in ws-alpha')
  })

  it('disables a row with nothing to archive, and says so', () => {
    const element = row('a')
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, { ...ungrouped, sessionCount: 0 }]]),
      archive: async () => 'done',
      copy,
      warn: () => {},
    })
    buttons.sync()
    expect(injectedButtons()[0]!.disabled).toBe(true)
    expect(injectedButtons()[0]!.title).toBe('nothing in ungrouped')
  })

  it('disables every row when the host reports the capability off', () => {
    const element = row('a')
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, alpha]]),
      archive: async () => 'done',
      blocked: 'the host archive API moved',
      copy,
      warn: () => {},
    })
    buttons.sync()
    expect(injectedButtons()[0]!.disabled).toBe(true)
    expect(injectedButtons()[0]!.title).toBe('the host archive API moved')
  })

  it('re-injects into a row that React remounted', () => {
    let element = row('a')
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, alpha]]),
      archive: async () => 'done',
      copy,
      warn: () => {},
    })
    buttons.sync()
    expect(injectedButtons()).toHaveLength(1)

    // Collapsing the sidebar to the 56px rail unmounts every row; expanding it
    // mounts fresh elements that carry nothing this plugin put there.
    document.body.innerHTML = ''
    element = row('a')
    buttons.sync()
    expect(injectedButtons()).toHaveLength(1)
    expect(element.firstElementChild!.children).toHaveLength(2)
  })

  it('drops its bookkeeping for a row that disappeared', () => {
    const rows = [row('a'), row('b')]
    let visible = rows
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf(visible.map((element) => [element, alpha] as [HTMLElement, RowGroup])),
      archive: async () => 'done',
      copy,
      warn: () => {},
    })
    buttons.sync()
    expect(injectedButtons()).toHaveLength(2)

    // The ungrouped row stops rendering the moment its last member is archived.
    visible = [rows[0]!]
    buttons.sync()
    expect(injectedButtons()).toHaveLength(1)
    expect(rows[1]!.firstElementChild!.children).toHaveLength(1)
  })

  it('sends the row scope, never a session list', async () => {
    const rows = [row('a'), row('b')]
    const archive = vi.fn(async (_group: RowGroup) => 'done')
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[rows[0]!, alpha], [rows[1]!, ungrouped]]),
      archive,
      copy,
      warn: () => {},
    })
    buttons.sync()

    injectedButtons()[0]!.click()
    injectedButtons()[1]!.click()
    await vi.waitFor(() => expect(archive).toHaveBeenCalledTimes(2))
    expect(archive.mock.calls.map(([group]) => group)).toEqual([alpha, ungrouped])
  })

  it('keeps the row from toggling open when its button is clicked', () => {
    const element = row('a')
    const rowClick = vi.fn()
    element.addEventListener('click', rowClick)
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, alpha]]),
      archive: async () => 'done',
      copy,
      warn: () => {},
    })
    buttons.sync()

    injectedButtons()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(rowClick).not.toHaveBeenCalled()
  })

  it('reports the outcome into the tooltip the pointer is already over', async () => {
    const element = row('a')
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, alpha]]),
      archive: async () => '已归档 3 个会话',
      copy,
      warn: () => {},
    })
    buttons.sync()

    injectedButtons()[0]!.click()
    await vi.waitFor(() => expect(injectedButtons()[0]!.title).toBe('已归档 3 个会话'))
    expect(injectedButtons()[0]!.disabled).toBe(false)
  })

  it('holds the outcome against the re-label the archive itself provokes', async () => {
    const element = row('a')
    const emptied: RowGroup = { ...alpha, sessionCount: 0 }
    let group = alpha
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, group]]),
      archive: async () => {
        group = emptied
        return '已归档 3 个会话'
      },
      copy,
      warn: () => {},
    })
    buttons.sync()

    injectedButtons()[0]!.click()
    await vi.waitFor(() => expect(injectedButtons()[0]!.title).toBe('已归档 3 个会话'))

    // The row now holds nothing, so every later scan would say so.
    buttons.sync()
    buttons.sync()
    expect(injectedButtons()[0]!.title).toBe('已归档 3 个会话')
    expect(injectedButtons()[0]!.disabled).toBe(true)

    // Moving off the row is the moment the report has been seen or missed.
    element.dispatchEvent(new MouseEvent('pointerleave'))
    expect(injectedButtons()[0]!.title).toBe('nothing in ws-alpha')
  })

  it('reports a thrown transport failure rather than swallowing it', async () => {
    const element = row('a')
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf([[element, alpha]]),
      archive: async () => {
        throw new Error('connection lost')
      },
      copy,
      warn: () => {},
    })
    buttons.sync()

    injectedButtons()[0]!.click()
    await vi.waitFor(() => expect(injectedButtons()[0]!.title).toBe('connection lost'))
  })

  describe('kill-switch', () => {
    it('tolerates failures below the threshold', () => {
      const element = row('a')
      const buttons = createRowButtons({
        root: document,
        scan: () => scanOf([[element, alpha]], 1),
        archive: async () => 'done',
        copy,
        warn: () => {},
      })
      for (let round = 0; round < 7; round += 1) buttons.sync()
      expect(injectedButtons()).toHaveLength(1)
    })

    it('removes every injected node once failures accumulate past it', () => {
      const rows = [row('a'), row('b')]
      const warn = vi.fn()
      const buttons = createRowButtons({
        root: document,
        scan: () => scanOf(rows.map((element) => [element, alpha] as [HTMLElement, RowGroup]), 2),
        archive: async () => 'done',
        copy,
        warn,
      })
      for (let round = 0; round < 4; round += 1) buttons.sync()

      expect(injectedButtons()).toHaveLength(0)
      for (const element of rows) expect(element.firstElementChild!.children).toHaveLength(1)
    })

    it('explains itself exactly once, naming the version it was written for', () => {
      const element = row('a')
      const warn = vi.fn()
      const buttons = createRowButtons({
        root: document,
        scan: () => scanOf([[element, alpha]], 8),
        archive: async () => 'done',
        copy,
        warn,
      })
      buttons.sync()
      buttons.sync()
      buttons.sync()

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]![0]).toContain('0.1.5-rc.1')
      expect(warn.mock.calls[0]![0]).toContain('sidebar row buttons disabled')
    })

    it('never injects again after it has fired', () => {
      const element = row('a')
      let unrecognized = 8
      const buttons = createRowButtons({
        root: document,
        scan: () => scanOf([[element, alpha]], unrecognized),
        archive: async () => 'done',
        copy,
        warn: () => {},
      })
      buttons.sync()
      unrecognized = 0
      buttons.sync()
      expect(injectedButtons()).toHaveLength(0)
    })
  })

  it('leaves the built-in sidebar exactly as it found it on unload', () => {
    const rows = [row('a'), row('b')]
    const before = rows.map((element) => element.outerHTML)
    const buttons = createRowButtons({
      root: document,
      scan: () => scanOf(rows.map((element) => [element, alpha] as [HTMLElement, RowGroup])),
      archive: async () => 'done',
      copy,
      warn: () => {},
    })
    buttons.sync()
    buttons.dispose()

    expect(rows.map((element) => element.outerHTML)).toEqual(before)
    buttons.sync()
    expect(injectedButtons()).toHaveLength(0)
  })
})
