/**
 * The bulk-archive control this plugin grafts onto the built-in sidebar's rows.
 *
 * The built-in workspace browser has no slot anywhere near a row: its row menus
 * are hard-coded arrays and the ungrouped row has no menu at all, so an inline
 * button placed into the row's own action strip is the only additive place a
 * third party can reach. That makes this the single most fragile piece of the
 * plugin, and everything below is shaped by two measurements on a live sidebar:
 *
 * - React never removes or reorders a node injected into an action strip it
 *   keeps mounted. Group expansion, hover, archive-set changes, a new session
 *   list, a group disappearing, and a sibling row being inserted all leave the
 *   injected node exactly where it was put.
 * - React *does* take it away when the row itself unmounts, which the sidebar
 *   does wholesale when it collapses to the 56px rail or the viewport narrows.
 *   Remounted rows come back bare.
 *
 * So survival is not something to defend; re-injection is. This module owns the
 * bookkeeping that makes a re-scan idempotent, and the kill-switch that stops
 * every injection at once rather than leaving a half-recognized sidebar behind.
 */

import { ADAPTER_VERSION, INJECTED_ATTRIBUTE, scanRows } from './adapter.js'
import type { RowGroup, RowScan, SidebarRow } from './adapter.js'

/**
 * How many unreadable rows are tolerated before all injection stops.
 *
 * Recognition failures accumulate rather than reset, because every scan
 * re-counts a row that is genuinely unreadable: a real shape change trips this
 * within a few scans, while a single anomalous frame does not.
 */
const FAILURE_THRESHOLD = 8

/** A 16px archive glyph, sized and coloured by the row's own icon-button class. */
const ARCHIVE_ICON =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">' +
  '<rect x="1.9" y="2.4" width="12.2" height="3.4" rx="1.2" stroke="currentColor" stroke-width="1.3"/>' +
  '<path d="M3.2 6.4v5.3c0 1.1.9 2 2 2h5.6c1.1 0 2-.9 2-2V6.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
  '<path d="M6.3 9h3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
  '</svg>'

/** The prose the control needs; supplied by the caller so no strings live here. */
export interface RowButtonCopy {
  /** Tooltip for an actionable row: names the row and how many sessions it holds. */
  action(row: RowGroup): string
  /** Tooltip for a row with nothing to archive. */
  empty(row: RowGroup): string
  /** Tooltip while the request is in flight. */
  busy: string
}

/** What the control needs from the rest of the plugin. */
export interface RowButtonsOptions {
  /** Where to look for rows. The document in production. */
  readonly root: ParentNode
  /** Recognition. Injected so the lifecycle can be exercised without a host. */
  readonly scan?: (root: ParentNode) => RowScan
  /**
   * Archive everything the row displays, and describe the outcome in one line.
   *
   * The membership predicate stays on the host: this control sends a scope, not
   * a session list, so the browser can never disagree with what gets archived.
   */
  readonly archive: (group: RowGroup) => Promise<string>
  /** Why the archive capability is off, when it is; the control then never fires. */
  readonly blocked?: string | undefined
  readonly copy: RowButtonCopy
  /** One-line diagnostics. English, as host logs are. */
  readonly warn: (message: string) => void
}

/** The mounted control set. */
export interface RowButtons {
  /** Bring the injected set in line with what is rendered right now. */
  sync(): void
  /** Remove every injected node and stop. */
  dispose(): void
}

/** Whether a row can be acted on at all. */
function actionable(group: RowGroup, blocked: string | undefined): boolean {
  return blocked === undefined && group.sessionCount > 0
}

/**
 * Inject a bulk-archive button into every sidebar row, and keep it there.
 *
 * @param options - recognition, the action, and the prose.
 * @returns the control set, which the caller must dispose on unload.
 */
export function createRowButtons(options: RowButtonsOptions): RowButtons {
  const scan = options.scan ?? scanRows
  const injected = new Map<Element, HTMLButtonElement>()
  /**
   * What each button last reported, held until the pointer leaves its row.
   *
   * A successful archive empties the row, so the very next scan would relabel
   * the button "nothing to archive" and the report would be gone before it
   * could be read. Outcomes therefore outrank state until the pointer moves on.
   */
  const reports = new WeakMap<HTMLButtonElement, string>()
  let failures = 0
  let stopped = false

  /** Label a button for the row it now belongs to. */
  function describe(button: HTMLButtonElement, group: RowGroup): void {
    const state = options.blocked ?? (group.sessionCount === 0 ? options.copy.empty(group) : options.copy.action(group))
    const label = reports.get(button) ?? state
    button.title = label
    button.setAttribute('aria-label', label)
    button.disabled = !actionable(group, options.blocked)
  }

  /** Run the archive for one row, reporting into the button's own tooltip. */
  async function run(button: HTMLButtonElement, row: Element, group: RowGroup): Promise<void> {
    button.disabled = true
    button.title = options.copy.busy
    button.setAttribute('aria-label', options.copy.busy)
    let report: string
    try {
      report = await options.archive(group)
    } catch (error) {
      report = error instanceof Error ? error.message : String(error)
    }
    if (!button.isConnected) return
    // The row is under the pointer whenever this button is visible at all, so
    // the tooltip is the one feedback channel that is certain to be on screen.
    reports.set(button, report)
    row.addEventListener('pointerleave', () => {
      reports.delete(button)
      const settled = currentGroupOf(row)
      if (settled !== undefined) describe(button, settled)
    }, { once: true })
    describe(button, currentGroupOf(row) ?? group)
  }

  /** Create the control for one row, positioned before the row's "+" button. */
  function attach(target: SidebarRow): HTMLButtonElement {
    const button = target.row.ownerDocument.createElement('button')
    button.type = 'button'
    button.setAttribute(INJECTED_ATTRIBUTE, ADAPTER_VERSION)
    // Wearing the row's own icon-button class keeps the size, colour, and hover
    // treatment identical to the "+" it sits beside, without this plugin ever
    // naming a mangled class or reproducing a single rule of the host's CSS.
    button.className = target.anchor.className
    button.innerHTML = ARCHIVE_ICON
    button.addEventListener('click', (event) => {
      // The row element's own click handler toggles the group open.
      event.stopPropagation()
      event.preventDefault()
      const group = currentGroupOf(target.row) ?? target.group
      void run(button, target.row, group)
    })
    target.actions.insertBefore(button, target.anchor)
    return button
  }

  /**
   * Re-read a row's group at click time.
   *
   * A collapsed row shows no session list, so archiving elsewhere can change
   * `sessionCount` without changing one byte of this row's DOM — no mutation
   * fires and the tooltip would otherwise go stale. Reading the fiber again on
   * use costs a handful of pointer hops and is always current.
   */
  function currentGroupOf(row: Element): RowGroup | undefined {
    return scan(options.root).rows.find((candidate) => candidate.row === row)?.group
  }

  /** Stop everything, once, with one explanation. */
  function disable(reason: string): void {
    stopped = true
    removeAll()
    options.warn(
      `session-archive: sidebar row buttons disabled — ${reason}. ` +
        `The recognition rules in this build target DSH ${ADAPTER_VERSION}; ` +
        'the built-in sidebar is left exactly as it was.',
    )
  }

  function removeAll(): void {
    for (const button of injected.values()) button.remove()
    injected.clear()
  }

  function sync(): void {
    if (stopped) return
    const result = scan(options.root)

    failures += result.unrecognized
    if (failures >= FAILURE_THRESHOLD) {
      disable(`${String(failures)} sidebar rows could not be recognized`)
      return
    }

    const live = new Set<Element>()
    for (const target of result.rows) {
      live.add(target.row)
      const existing = injected.get(target.row)
      // A remounted row is a different element carrying no button, so the map
      // entry is stale rather than reusable.
      const button = existing !== undefined && existing.isConnected ? existing : attach(target)
      injected.set(target.row, button)
      describe(button, target.group)
    }

    for (const [row, button] of injected) {
      if (live.has(row)) continue
      button.remove()
      injected.delete(row)
    }
  }

  return {
    sync,
    dispose: () => {
      stopped = true
      removeAll()
    },
  }
}
