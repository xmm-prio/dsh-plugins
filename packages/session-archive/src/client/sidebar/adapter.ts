/**
 * Everything this plugin knows about the built-in sidebar's rendered shape.
 *
 * This is the one file an upstream redesign should have to replace. Nothing
 * outside it may look at a class name, a DOM relationship, or a React fiber;
 * the injector above it works purely in terms of {@link SidebarRow}.
 *
 * Every rule below was measured against a rendered `0.1.5-rc.1` sidebar, not
 * inferred from the shipped bundle. Two of the measurements overturned what a
 * static read suggested, and both are recorded as comments where they bite.
 */

/**
 * The host release this recognition was measured against.
 *
 * Bumped whenever a rule below changes, so a console message can name the
 * expectation that stopped holding.
 */
export const ADAPTER_VERSION = '0.1.5-rc.1'

/** Marks the nodes this plugin owns, so a re-scan never adopts its own work. */
export const INJECTED_ATTRIBUTE = 'data-session-archive-row-action'

/** A workspace row, or the ungrouped row, as `deriveGroups` built it. */
export interface RowGroup {
  /** `undefined` for the ungrouped row. Never discriminate on `label`. */
  readonly workspaceId: string | undefined
  /** The workspace's own title. Empty for ungrouped *and* for an untitled workspace. */
  readonly label: string
  /** Sessions the row currently displays. Updates the moment one is archived. */
  readonly sessionCount: number
}

/** One recognized row: where to inject, what to inject next to, and for whom. */
export interface SidebarRow {
  /** The row element, and the identity a caller keys its bookkeeping on. */
  readonly row: Element
  /** The action strip. Hidden by CSS until the row is hovered. */
  readonly actions: Element
  /** The trailing "+" button; injection goes immediately before it. */
  readonly anchor: Element
  readonly group: RowGroup
}

/** What one pass over the sidebar found. */
export interface RowScan {
  readonly rows: readonly SidebarRow[]
  /**
   * Row-shaped elements this adapter could not read.
   *
   * A non-zero count means the sidebar still renders rows but no longer looks
   * the way this adapter expects — the precise condition the kill-switch is
   * for. Zero rows *and* zero failures is upstream having renamed the row
   * itself, which is harmless: nothing is injected and nothing is disturbed.
   */
  readonly unrecognized: number
}

/**
 * lightningcss mangles CSS-module locals to `<hash>_<local>` with one hash per
 * file, and the hash changes every build. Suffix matching survives that; the
 * literal `YDXeBa_` must never appear in this plugin.
 */
const ROW_SELECTOR = '[class*="_projectRow"]'

/**
 * Direct child on purpose. `.rowActions` is not unique to workspace rows — the
 * session rows underneath a group carry the identical mangled class — so a
 * descendant match would inject into session-row action strips, which the spec
 * excludes outright. Anchoring on the row and taking only its own child strip
 * is what keeps that boundary.
 */
const ACTIONS_SELECTOR = ':scope > [class*="_rowActions"]'

/**
 * How far up the fiber tree `props.group` may sit.
 *
 * Measured: three levels above a workspace row's element (a tooltip wrapper and
 * its trigger `span` sit in between) and one level above the ungrouped row's,
 * which has neither. The depth is therefore *not* a constant and a fixed walk
 * would silently miss one of the two row kinds — the search is bounded instead.
 */
const MAX_FIBER_DEPTH = 8

/** React stamps its fiber onto the DOM node under a per-build random suffix. */
const FIBER_KEY_PREFIX = '__reactFiber$'

/** Minimal view of a React fiber; only the two fields this walk reads. */
interface FiberLike {
  readonly memoizedProps?: Record<string, unknown> | null | undefined
  readonly return?: FiberLike | null | undefined
}

/**
 * Accept a value as the group object `deriveGroups` constructs.
 *
 * Deliberately strict: the point of the kill-switch is to notice when the shape
 * moved, and a lenient check would let a differently-shaped object through and
 * archive the wrong sessions.
 */
function asRowGroup(value: unknown): RowGroup | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const group = value as Record<string, unknown>
  if (typeof group['key'] !== 'string') return undefined
  if (typeof group['sessionCount'] !== 'number') return undefined
  if (typeof group['expanded'] !== 'boolean') return undefined
  if (typeof group['label'] !== 'string') return undefined
  const workspaceId = group['workspaceId']
  if (workspaceId !== undefined && typeof workspaceId !== 'string') return undefined
  return { workspaceId, label: group['label'], sessionCount: group['sessionCount'] }
}

/**
 * Read the group a row renders, from the React fiber attached to its element.
 * @param element - the row element.
 * @returns the group, or undefined when no fiber within reach carries one.
 */
export function readRowGroup(element: Element): RowGroup | undefined {
  const key = Object.keys(element).find((name) => name.startsWith(FIBER_KEY_PREFIX))
  if (key === undefined) return undefined
  let fiber: FiberLike | null | undefined = (element as unknown as Record<string, FiberLike | undefined>)[key]
  for (let depth = 0; fiber !== undefined && fiber !== null && depth < MAX_FIBER_DEPTH; depth += 1) {
    const group = asRowGroup(fiber.memoizedProps?.['group'])
    if (group !== undefined) return group
    fiber = fiber.return
  }
  return undefined
}

/**
 * Find the "+" button an injected action goes before.
 *
 * The strip renders `[Menu?, PlusButton]`: a workspace row has both, the
 * ungrouped row only the button. Injecting after the last child would put the
 * action past "+", so the anchor is the last child this plugin does not own.
 */
function anchorOf(actions: Element): Element | undefined {
  for (let child = actions.lastElementChild; child !== null; child = child.previousElementSibling) {
    if (child.hasAttribute(INJECTED_ATTRIBUTE)) continue
    return child.tagName === 'BUTTON' ? child : undefined
  }
  return undefined
}

/**
 * Recognize every workspace and ungrouped row currently rendered.
 * @param root - the element to search; the document in production.
 * @returns the recognized rows and the count of row-shaped elements that failed.
 */
export function scanRows(root: ParentNode): RowScan {
  const rows: SidebarRow[] = []
  let unrecognized = 0
  for (const row of root.querySelectorAll(ROW_SELECTOR)) {
    const actions = row.querySelector(ACTIONS_SELECTOR)
    const anchor = actions === null ? undefined : anchorOf(actions)
    const group = readRowGroup(row)
    if (actions === null || anchor === undefined || group === undefined) {
      unrecognized += 1
      continue
    }
    rows.push({ row, actions, anchor, group })
  }
  return { rows, unrecognized }
}
