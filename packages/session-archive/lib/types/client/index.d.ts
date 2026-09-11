/**
 * Browser half of the session archive plugin.
 *
 * Two surfaces. The archive area goes into the host's own
 * `sidebar.footer.action` slot, so nothing about the sidebar is patched to get
 * it. The per-row bulk-archive button has no slot to go into — the built-in
 * workspace browser exposes none anywhere near a row — and is injected into the
 * row's action strip instead, behind the kill-switch in `sidebar/`.
 *
 * @module @dsh-plugins/session-archive/client
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "session-archive-client";
/**
 * `slots` is the only hard dependency.
 *
 * `connection` is deliberately absent: it is read with `ctx.get` when a call is
 * actually made, so a profile that mounts the slots service but not the
 * connection still shows the entry point with an explanatory failure instead of
 * silently never activating. A misspelling in this array produces exactly that
 * silence, with no error anywhere.
 */
export declare const inject: readonly ["slots"];
/**
 * Mount the browser half.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: Context): void;
