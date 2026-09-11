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
import type { RowGroup, RowScan } from './adapter.js';
/** The prose the control needs; supplied by the caller so no strings live here. */
export interface RowButtonCopy {
    /** Tooltip for an actionable row: names the row and how many sessions it holds. */
    action(row: RowGroup): string;
    /** Tooltip for a row with nothing to archive. */
    empty(row: RowGroup): string;
    /** Tooltip while the request is in flight. */
    busy: string;
}
/** What the control needs from the rest of the plugin. */
export interface RowButtonsOptions {
    /** Where to look for rows. The document in production. */
    readonly root: ParentNode;
    /** Recognition. Injected so the lifecycle can be exercised without a host. */
    readonly scan?: (root: ParentNode) => RowScan;
    /**
     * Archive everything the row displays, and describe the outcome in one line.
     *
     * The membership predicate stays on the host: this control sends a scope, not
     * a session list, so the browser can never disagree with what gets archived.
     */
    readonly archive: (group: RowGroup) => Promise<string>;
    /** Why the archive capability is off, when it is; the control then never fires. */
    readonly blocked?: string | undefined;
    readonly copy: RowButtonCopy;
    /** One-line diagnostics. English, as host logs are. */
    readonly warn: (message: string) => void;
}
/** The mounted control set. */
export interface RowButtons {
    /** Bring the injected set in line with what is rendered right now. */
    sync(): void;
    /** Remove every injected node and stop. */
    dispose(): void;
}
/**
 * Inject a bulk-archive button into every sidebar row, and keep it there.
 *
 * @param options - recognition, the action, and the prose.
 * @returns the control set, which the caller must dispose on unload.
 */
export declare function createRowButtons(options: RowButtonsOptions): RowButtons;
