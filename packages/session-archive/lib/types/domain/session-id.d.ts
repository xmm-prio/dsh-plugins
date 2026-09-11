/**
 * SessionId admissibility for filesystem-facing operations.
 *
 * Session ids reach the plugin over RPC, so every id that is about to be turned
 * into (or compared against) a path segment passes through here first. The check
 * is deliberately platform-independent: a POSIX host must still refuse ids that
 * would be dangerous once the same archive set is opened on Windows.
 */
/** Longest id accepted as a single path segment on the strictest supported filesystem. */
export declare const MAX_SESSION_ID_LENGTH = 255;
/** Why a session id may not be used to address a directory. */
export type SessionIdRejection = 'empty' | 'too-long' | 'path-separator' | 'nul' | 'dot-segment' | 'control-character' | 'drive-letter';
/**
 * Check whether a session id may address a single filesystem directory.
 * @param value - candidate id, typically arriving from the browser half.
 * @returns the rejection reason, or undefined when the id is admissible.
 */
export declare function validateSessionId(value: string): SessionIdRejection | undefined;
