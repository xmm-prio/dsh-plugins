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
import type { ArchivedSessionEntry } from '../contract.js';
/** One workspace's worth of archived sessions. */
export interface ArchiveViewGroup {
    /** The workspace, or undefined for the 未分组 bucket. */
    readonly workspaceId: string | undefined;
    /** The workspace's title, or undefined for the 未分组 bucket. */
    readonly title: string | undefined;
    /** Members, newest activity first. */
    readonly entries: readonly ArchivedSessionEntry[];
    /** Sum of the members' known sizes; entries with no reported size add nothing. */
    readonly sizeBytes: number;
}
/** The list as the panel shows it. */
export interface ArchiveView {
    readonly groups: readonly ArchiveViewGroup[];
    /** Entries the query left out. Zero when there is no query. */
    readonly hidden: number;
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
export declare function entryLabel(entry: ArchivedSessionEntry): string;
/**
 * Group, filter, and order the archive area's rows.
 *
 * @param entries - every archived session, in host order.
 * @param query - the search box's contents; blank means no filtering.
 * @returns the groups to render and how many entries the query hid.
 */
export declare function buildArchiveView(entries: readonly ArchivedSessionEntry[], query: string): ArchiveView;
