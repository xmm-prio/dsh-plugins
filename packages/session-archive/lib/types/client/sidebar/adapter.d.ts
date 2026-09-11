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
export declare const ADAPTER_VERSION = "0.1.5-rc.1";
/** Marks the nodes this plugin owns, so a re-scan never adopts its own work. */
export declare const INJECTED_ATTRIBUTE = "data-session-archive-row-action";
/** A workspace row, or the ungrouped row, as `deriveGroups` built it. */
export interface RowGroup {
    /** `undefined` for the ungrouped row. Never discriminate on `label`. */
    readonly workspaceId: string | undefined;
    /** The workspace's own title. Empty for ungrouped *and* for an untitled workspace. */
    readonly label: string;
    /** Sessions the row currently displays. Updates the moment one is archived. */
    readonly sessionCount: number;
}
/** One recognized row: where to inject, what to inject next to, and for whom. */
export interface SidebarRow {
    /** The row element, and the identity a caller keys its bookkeeping on. */
    readonly row: Element;
    /** The action strip. Hidden by CSS until the row is hovered. */
    readonly actions: Element;
    /** The trailing "+" button; injection goes immediately before it. */
    readonly anchor: Element;
    readonly group: RowGroup;
}
/** What one pass over the sidebar found. */
export interface RowScan {
    readonly rows: readonly SidebarRow[];
    /**
     * Row-shaped elements this adapter could not read.
     *
     * A non-zero count means the sidebar still renders rows but no longer looks
     * the way this adapter expects — the precise condition the kill-switch is
     * for. Zero rows *and* zero failures is upstream having renamed the row
     * itself, which is harmless: nothing is injected and nothing is disturbed.
     */
    readonly unrecognized: number;
}
/**
 * Read the group a row renders, from the React fiber attached to its element.
 * @param element - the row element.
 * @returns the group, or undefined when no fiber within reach carries one.
 */
export declare function readRowGroup(element: Element): RowGroup | undefined;
/**
 * Recognize every workspace and ungrouped row currently rendered.
 * @param root - the element to search; the document in production.
 * @returns the recognized rows and the count of row-shaped elements that failed.
 */
export declare function scanRows(root: ParentNode): RowScan;
