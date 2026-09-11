/**
 * Host error identification without importing a single host class.
 *
 * `instanceof` is the wrong tool here. This plugin is loaded from outside the
 * profile's module tree, so a value import of `@deepseek-ai/dsh-workspace`
 * would either fail to resolve at runtime or resolve to a *second* physical
 * copy — and a second copy makes every `instanceof` false while splitting the
 * Service and Context class identities that the whole harness depends on.
 *
 * All the host's error classes assign `this.name` in their constructor, so the
 * name is a stable, copy-independent discriminator.
 *
 * This is the *only* way the host half identifies a host error. Structural
 * duck-typing of the same classes elsewhere would be a second mechanism
 * answering the same question, free to disagree with this one; reading a
 * *field* off an error this module has already identified is not — that is
 * using the identification, not repeating it.
 */
/** The registry refused to archive a session it cannot find in persistence. */
export declare function isUnknownSessionError(error: unknown): boolean;
/** Someone still holds the session's write lease. */
export declare function isAlreadyOwnedError(error: unknown): boolean;
/** The stored log is in a format version this DSH build will not address. */
export declare function isFormatUnsupportedError(error: unknown): boolean;
/** Render any thrown value as one diagnostic line. */
export declare function describeError(error: unknown): string;
/** The message of any thrown value, without the class name in front of it. */
export declare function errorMessage(error: unknown): string;
