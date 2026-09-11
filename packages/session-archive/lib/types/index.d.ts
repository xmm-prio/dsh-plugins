/**
 * Host half of the session archive plugin.
 *
 * Completes the workspace → archive area → delete chain that DSH itself stops
 * halfway through: the built-in archive is one-way, and there is no way to
 * remove a session log at all. Nothing here modifies, shadows, or forks a
 * built-in plugin.
 *
 * `apply` is written to be incapable of throwing. An exception escaping it does
 * not disable this plugin — it aborts the whole harness boot, so a user would
 * lose their entire DSH because a third-party plugin looked at a shape that had
 * moved.
 *
 * @module @dsh-plugins/session-archive
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
export { Config } from './config.js';
export declare const name = "session-archive";
/**
 * Hard dependencies, declared so cordis holds `apply` until they are ready.
 *
 * Only direct property access needs this: `ctx.foo` goes through a Guard that
 * throws for an undeclared service, while `ctx.get('foo')` bypasses it and
 * needs no declaration. Everything degradable is read that way instead, which
 * is the host's own optional-dependency idiom.
 *
 * A misspelling here fails silently — the plugin simply never activates — so
 * these four names are the ones to check first if nothing happens at all.
 */
export declare const inject: readonly ["connection", "workspaceRegistry", "sessionPersistence"];
/**
 * Mount the host half.
 * @param ctx - the plugin context.
 * @param config - validated configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
