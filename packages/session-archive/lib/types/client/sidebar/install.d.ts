/**
 * Browser wiring for the injected sidebar row buttons.
 *
 * Everything environmental lives here — the mutation observer, the hover
 * refresh, the capability probe, and the unload teardown — so `row-buttons`
 * stays a lifecycle over an adapter and `adapter` stays pure recognition.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ArchiveApi } from '../transport/archive-api.js';
/**
 * Inject and maintain a bulk-archive button on every sidebar row.
 *
 * @param ctx - the browser plugin context; unload removes every injected node.
 * @param api - the host endpoints.
 */
export declare function installSidebarButtons(ctx: Context, api: ArchiveApi): void;
