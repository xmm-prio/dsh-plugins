/**
 * The built-in sidebar's grouping rules, restated on the host side.
 *
 * Bulk archive has to select exactly the sessions the user sees under a
 * workspace row or the ungrouped row, so this module mirrors
 * `dsh-client-ui-workspace`'s `groupByWorkspace` / `sessionVisible` verbatim —
 * including the detail that accounting happens *before* the visibility test,
 * which is what keeps an archived ledger member out of ungrouped.
 */

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
  /** The session currently selected in the UI, whose blank row stays visible. */
  readonly current: string | undefined
}

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
  return entry.origin !== 'subagent' && !archived.has(entry.id) && (!entry.blank || entry.id === current)
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

/** Why a member of the scope is not archived. */
export type ArchiveSkipReason = 'subagent' | 'already-archived' | 'blank'

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
 * Why the archive writer must leave a session alone, if it must.
 *
 * Blank sessions are skipped unconditionally, including the selected blank row
 * that {@link sessionVisible} keeps on screen. Archiving is a visibility
 * decision, and a blank session is either already off screen — in which case
 * archiving it changes nothing a user can see — or it is the empty session DSH
 * just opened for them, which is the one row they would not want hidden.
 */
function skipReason(entry: SessionListEntry, archived: ReadonlySet<string>): ArchiveSkipReason | undefined {
  if (entry.origin === 'subagent') return 'subagent'
  if (archived.has(entry.id)) return 'already-archived'
  if (entry.blank) return 'blank'
  return undefined
}

/**
 * Select the sessions a "archive everything in this row" action should archive.
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
    const reason = skipReason(entry, input.archived)
    if (reason === undefined) targets.push(id)
    else skipped.push({ id, reason })
  }
  return { targets, skipped, unknownScope: false }
}
