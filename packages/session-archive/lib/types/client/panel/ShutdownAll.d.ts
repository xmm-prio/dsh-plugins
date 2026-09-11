/**
 * Stop every running agent, from the archive area.
 *
 * Bulk archive used to live beside this button, as a per-row list built from a
 * host-side `groups` endpoint. That endpoint was a second reconstruction of the
 * built-in sidebar's grouping, maintained here and able to drift from the rows
 * the user actually sees. Bulk archive now sits on the sidebar rows themselves,
 * where the target is the row's own group object and cannot disagree with it.
 * Shutdown-all has no such row to belong to, so it stays here.
 */
import type { ArchiveApi } from '../transport/archive-api.js';
/** The shutdown-all action and the line it reports into. */
export declare function ShutdownAll({ api, enabled }: {
    api: ArchiveApi;
    enabled: boolean;
}): JSX.Element;
