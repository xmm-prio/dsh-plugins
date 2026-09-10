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
 */

/** Names of the host errors this plugin reacts to. */
const KNOWN = {
  unknownSession: 'WorkspaceUnknownSessionError',
  alreadyOwned: 'SessionAlreadyOwnedError',
  formatUnsupported: 'SessionFormatUnsupportedError',
  notFound: 'SessionPersistenceNotFoundError',
} as const

function named(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name
}

/** The registry refused to archive a session it cannot find in persistence. */
export function isUnknownSessionError(error: unknown): boolean {
  return named(error, KNOWN.unknownSession)
}

/** Someone still holds the session's write lease. */
export function isAlreadyOwnedError(error: unknown): boolean {
  return named(error, KNOWN.alreadyOwned)
}

/** The stored log is in a format version this DSH build will not address. */
export function isFormatUnsupportedError(error: unknown): boolean {
  return named(error, KNOWN.formatUnsupported)
}

/** The persistence backend has no such session. */
export function isSessionNotFoundError(error: unknown): boolean {
  return named(error, KNOWN.notFound)
}

/** Render any thrown value as one diagnostic line. */
export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
