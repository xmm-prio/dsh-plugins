/**
 * Release what is running in the background, from the archive area.
 *
 * Bulk archive used to live beside this button, as a per-row list built from a
 * host-side `groups` endpoint. That endpoint was a second reconstruction of the
 * built-in sidebar's grouping, maintained here and able to drift from the rows
 * the user actually sees. Bulk archive now sits on the sidebar rows themselves,
 * where the target is the row's own group object and cannot disagree with it.
 * This action has no such row to belong to, so it stays here.
 *
 * The session the user is currently looking at is left alone. The action
 * exists to free background resources, and the foreground session is not one
 * of them — it is also the one whose teardown a user would least expect from
 * a button in another panel. Its own header carries the button that closes it.
 *
 * It reports through `onReport` rather than rendering its own line: the panel
 * shows one status at a time, and two components writing two lines would let
 * the user read an answer to a question they had already moved on from.
 */
import type { ReactNode } from 'react';
import type { ArchiveApi } from '../transport/archive-api.js';
/** The background-shutdown action, as a toolbar button. */
export declare function ShutdownAll({ api, enabled, icon, currentSessionId, onReport, }: {
    api: ArchiveApi;
    enabled: boolean;
    /** Rendered inside the button; the label lives in the tooltip. */
    icon: ReactNode;
    /** The session the browser is showing, which is never a target. */
    currentSessionId: string | undefined;
    /** Hands the outcome to whoever owns the panel's status line. */
    onReport: (message: string) => void;
}): JSX.Element;
