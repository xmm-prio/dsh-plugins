/**
 * The built-in sidebar's grouping rules, restated on the host side.
 *
 * Bulk archive has to select exactly the sessions the user sees under a
 * workspace row or the ungrouped row, so this module mirrors
 * `dsh-client-ui-workspace`'s `groupByWorkspace` / `sessionVisible` verbatim —
 * including the detail that accounting happens *before* the visibility test,
 * which is what keeps an archived ledger member out of ungrouped.
 */

import type { ArchiveSkipReason } from '../contract.js'

/** The facts about a session that grouping needs; a projection of the host's list row. */
export interface SessionListEntry {
  readonly id: string
  /** `'subagent'` for delegated sessions; undefined for ordinary ones. */
  readonly origin?: string | undefined
  /** Whether the session has never started a turn. Blank is not the same as logless. */
  readonly blank: boolean
}

/** One workspace's ordered ledger of session ids. */
export interface WorkspaceLedger {
  readonly workspaceId: string
  readonly sessionIds: readonly string[]
}

/** Everything grouping reads. */
export interface GroupingInput {
  readonly sessions: readonly SessionListEntry[]
  readonly workspaces: readonly WorkspaceLedger[]
  readonly archived: ReadonlySet<string>
  /**
   * The session currently selected in the UI, whose blank row stays visible.
   *
   * The host half always passes {@link NO_SELECTION}. The selection is not a
   * host fact: it lives in the browser's `ClientSessions` as a private,
   * per-connection persisted cell projected onto `list.current`, no host RPC
   * carries it, and two attached browsers can hold different values. Bulk
   * archive is unaffected — see {@link NO_SELECTION}.
   */
  readonly current: string | undefined
}

/**
 * The selection to evaluate the sidebar's predicate against when there is none.
 *
 * Two callers pass this deliberately rather than by omission:
 *
 * - the host half, because it cannot know the browser's selection at all;
 * - {@link planBulkArchive}, because the spec skips blank sessions
 *   *unconditionally* — including the selected one, which is the "new session"
 *   row DSH just opened and the one row a user would not want hidden.
 *
 * Withholding the selection is therefore the mechanism that implements the
 * second rule, not an approximation of the first.
 */
export const NO_SELECTION: string | undefined = undefined

/** One row of the grouped view: what belongs to it, and what of that is on screen. */
export interface SessionGroup {
  /** Ledger members that exist in the session list, whether or not they show. */
  readonly accounted: readonly string[]
  /** The subset the built-in sidebar actually renders. */
  readonly visible: readonly string[]
}

/** A workspace row of the grouped view. */
export interface WorkspaceGroup extends SessionGroup {
  readonly workspaceId: string
}

/** The grouped view of the whole session list. */
export interface SessionGrouping {
  readonly workspaces: readonly WorkspaceGroup[]
  readonly ungrouped: SessionGroup
}

/**
 * Why the built-in sidebar keeps a session off screen, if it does.
 *
 * The three conjuncts of `dsh-client-ui-workspace`'s `sessionVisible`, written
 * once as a reason ladder so that "is it on screen" and "why was it not
 * archived" can never drift apart: they are the same three questions, and the
 * second is only the first with the answer kept.
 *
 * @param entry - the session row.
 * @param current - the selected session id, whose blank row stays on screen.
 * @param archived - the archive set.
 * @returns the reason it is hidden, or undefined when the sidebar renders it.
 */
function hiddenReason(
  entry: SessionListEntry,
  current: string | undefined,
  archived: ReadonlySet<string>,
): ArchiveSkipReason | undefined {
  if (entry.origin === 'subagent') return 'subagent'
  if (archived.has(entry.id)) return 'already-archived'
  if (entry.blank && entry.id !== current) return 'blank'
  return undefined
}

/**
 * The built-in sidebar's visibility predicate.
 * @param entry - the session row.
 * @param current - the selected session id, whose blank row stays on screen.
 * @param archived - the archive set.
 * @returns whether the built-in sidebar renders this session anywhere.
 */
export function sessionVisible(
  entry: SessionListEntry,
  current: string | undefined,
  archived: ReadonlySet<string>,
): boolean {
  return hiddenReason(entry, current, archived) === undefined
}

/**
 * Group a session list the way the built-in sidebar does.
 * @param input - session list, workspace ledgers, archive set, and selection.
 * @returns per-workspace rows plus the ungrouped complement.
 */
export function groupSessions(input: GroupingInput): SessionGrouping {
  const byId = new Map(input.sessions.map((entry) => [entry.id, entry]))
  const accountedIds = new Set<string>()
  const workspaces: WorkspaceGroup[] = []

  for (const workspace of input.workspaces) {
    const accounted: string[] = []
    const visible: string[] = []
    for (const id of workspace.sessionIds) {
      const entry = byId.get(id)
      if (entry === undefined) continue
      accountedIds.add(id)
      accounted.push(id)
      if (sessionVisible(entry, input.current, input.archived)) visible.push(id)
    }
    workspaces.push({ workspaceId: workspace.workspaceId, accounted, visible })
  }

  const strays = input.sessions.filter((entry) => !accountedIds.has(entry.id))
  return {
    workspaces,
    ungrouped: {
      accounted: strays.map((entry) => entry.id),
      visible: strays.filter((entry) => sessionVisible(entry, input.current, input.archived)).map((entry) => entry.id),
    },
  }
}

/** Which display row a bulk archive covers. */
export type BulkArchiveScope = { readonly kind: 'workspace'; readonly workspaceId: string } | { readonly kind: 'ungrouped' }

/** One skipped member and the reason it was left alone. */
export interface ArchiveSkip {
  readonly id: string
  readonly reason: ArchiveSkipReason
}

/** The archivable members of one display row, plus everything deliberately left out. */
export interface BulkArchivePlan {
  readonly targets: readonly string[]
  readonly skipped: readonly ArchiveSkip[]
  /** True when a workspace scope named a workspace that no longer has a ledger. */
  readonly unknownScope: boolean
}

/**
 * Select the sessions a "archive everything in this row" action should archive.
 *
 * The plan is the sidebar's own hidden-reason ladder run over the row's
 * accounted members with the selection withheld ({@link NO_SELECTION}), which
 * is what makes the selected blank row skip like any other blank row.
 * `input.current` is therefore deliberately not consulted here, and a test
 * pins that the plan is identical with and without it.
 *
 * @param input - grouping input plus the display row to act on.
 * @returns the archive targets in ledger order and the classified skips.
 */
export function planBulkArchive(input: GroupingInput & { readonly scope: BulkArchiveScope }): BulkArchivePlan {
  const byId = new Map(input.sessions.map((entry) => [entry.id, entry]))
  const grouping = groupSessions(input)

  let members: readonly string[] | undefined
  if (input.scope.kind === 'ungrouped') {
    members = grouping.ungrouped.accounted
  } else {
    const workspaceId = input.scope.workspaceId
    members = grouping.workspaces.find((group) => group.workspaceId === workspaceId)?.accounted
  }
  if (members === undefined) return { targets: [], skipped: [], unknownScope: true }

  const targets: string[] = []
  const skipped: ArchiveSkip[] = []
  for (const id of members) {
    const entry = byId.get(id)
    if (entry === undefined) continue
    const reason = hiddenReason(entry, NO_SELECTION, input.archived)
    if (reason === undefined) targets.push(id)
    else skipped.push({ id, reason })
  }
  return { targets, skipped, unknownScope: false }
}
