/**
 * The archive area's list, arranged for display.
 *
 * Grouping, searching, and ordering are decisions about data, not about JSX,
 * so they are made here once and the panel renders the answer. That is also
 * what makes them testable without a DOM.
 *
 * A session belongs to a workspace exactly when that workspace's ledger still
 * holds it, so the entries with no `workspaceId` are one bucket — 未分组 —
 * and a session whose workspace was removed is already in it. There is
 * nothing extra to do for "the workspace is gone": the host cannot name a
 * ledger that no longer exists, and inventing a second empty-workspace bucket
 * would claim knowledge this plugin does not have.
 */

import type { ArchivedSessionEntry } from '../contract.js'

/** One workspace's worth of archived sessions. */
export interface ArchiveViewGroup {
  /** The workspace, or undefined for the 未分组 bucket. */
  readonly workspaceId: string | undefined
  /** The workspace's title, or undefined for the 未分组 bucket. */
  readonly title: string | undefined
  /** Members, newest activity first. */
  readonly entries: readonly ArchivedSessionEntry[]
  /** Sum of the members' known sizes; entries with no reported size add nothing. */
  readonly sizeBytes: number
}

/** The list as the panel shows it. */
export interface ArchiveView {
  readonly groups: readonly ArchiveViewGroup[]
  /** Entries the query left out. Zero when there is no query. */
  readonly hidden: number
}

/**
 * The text one row is searched by.
 *
 * The same expression the row displays: a session with no resolvable title
 * degrades to its id, and searching has to reach the thing the user can
 * actually see.
 *
 * @param entry - one archived session.
 * @returns the row's searchable label.
 */
export function entryLabel(entry: ArchivedSessionEntry): string {
  return entry.title ?? entry.id
}

/** When a session was last touched, falling back to when it was created. */
function activityOf(entry: ArchivedSessionEntry): number {
  return entry.lastActivityAt ?? entry.createdAt
}

/**
 * Group, filter, and order the archive area's rows.
 *
 * @param entries - every archived session, in host order.
 * @param query - the search box's contents; blank means no filtering.
 * @returns the groups to render and how many entries the query hid.
 */
export function buildArchiveView(entries: readonly ArchivedSessionEntry[], query: string): ArchiveView {
  const needle = query.trim().toLocaleLowerCase()
  const matched =
    needle.length === 0
      ? entries
      : entries.filter((entry) => entryLabel(entry).toLocaleLowerCase().includes(needle))

  const buckets = new Map<string, ArchivedSessionEntry[]>()
  for (const entry of matched) {
    const key = entry.workspaceId ?? ''
    const bucket = buckets.get(key)
    if (bucket === undefined) buckets.set(key, [entry])
    else bucket.push(entry)
  }

  const groups = [...buckets].map(([key, members]) => {
    const sorted = [...members].sort((left, right) => activityOf(right) - activityOf(left))
    return {
      workspaceId: key === '' ? undefined : key,
      title: key === '' ? undefined : sorted[0]!.workspaceTitle,
      entries: sorted,
      sizeBytes: sorted.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0),
    }
  })

  // Newest group first, and 未分组 last however recent it is — it is a
  // catch-all rather than a place, and the sidebar puts it at the bottom too.
  groups.sort((left, right) => {
    if ((left.workspaceId === undefined) !== (right.workspaceId === undefined)) {
      return left.workspaceId === undefined ? 1 : -1
    }
    return activityOf(right.entries[0]!) - activityOf(left.entries[0]!)
  })

  return { groups, hidden: entries.length - matched.length }
}
