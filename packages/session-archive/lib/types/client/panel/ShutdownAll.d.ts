/**
 * Stop every running agent, from the archive area.
 *
 * Bulk archive used to live beside this button, as a per-row list built from a
 * host-side `groups` endpoint. That endpoint was a second reconstruction of the
 * built-in sidebar's grouping, maintained here and able to drift from the rows
 * the user actually sees. Bulk archive now sits on the sidebar rows themselves,
 * where the target is the row's own group object and cannot disagree with it.
 * Shutdown-all has no such row to belong to, so it stays here.
 *
 * It reports through `onReport` rather than rendering its own line: the panel
 * shows one status at a time, and two components writing two lines would let
 * the user read an answer to a question they had already moved on from.
 */
import type { ReactNode } from 'react';
import type { ArchiveApi } from '../transport/archive-api.js';
/** The shutdown-all action, as a toolbar button. */
export declare function ShutdownAll({ api, enabled, icon, onReport, }: {
    api: ArchiveApi;
    enabled: boolean;
    /** Rendered inside the button; the label lives in the tooltip. */
    icon: ReactNode;
    /** Hands the outcome to whoever owns the panel's status line. */
    onReport: (message: string) => void;
}): JSX.Element;
