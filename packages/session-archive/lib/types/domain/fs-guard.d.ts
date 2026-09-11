/**
 * Platform-independent path guards for the irreversible delete path.
 *
 * `node:path` answers for the host it runs on, which is the wrong authority
 * here: the guard must refuse a Windows-shaped path even when the process is
 * POSIX, so that a mistake cannot hide until the archive set is opened on the
 * other platform. Everything below therefore parses the path string itself.
 */
/**
 * Whether a path addresses a volume root with nothing below it.
 * @param value - candidate path in either separator flavour.
 * @returns true for `/`, `C:\`, `\\server\share`, and their extended-length forms.
 */
export declare function isFilesystemRoot(value: string): boolean;
/**
 * Whether one absolute path is a proper descendant of another.
 *
 * Segment-wise comparison, never string prefixing: `/root/abcdef` is not inside
 * `/root/abc`, and a path is never inside itself.
 * @param parent - candidate ancestor directory.
 * @param child - candidate descendant path.
 * @returns true only for a strict containment relation.
 */
export declare function isStrictlyInside(parent: string, child: string): boolean;
/** Why a directory may not be handed to the recursive remover. */
export type SessionDirRejection = 'invalid-session-id' | 'not-absolute' | 'filesystem-root' | 'outside-root' | 'shallow' | 'foreign-basename';
/** What the guard is asked to vouch for. */
export interface SessionDirCheck {
    /** Absolute directory that would be removed. */
    readonly dir: string;
    /**
     * Session the directory is claimed to belong to. Supply it only when the
     * directory name is expected to be the id verbatim — that holds for a path
     * this plugin composed itself, not for a path the persistence backend
     * resolved through its own segment encoder.
     */
    readonly sessionId?: string | undefined;
    /** Session log root the directory must live under, when one is known. */
    readonly root?: string | undefined;
}
/**
 * Decide whether a directory may be removed as one session's log directory.
 * @param check - the directory, its claimed owner, and the enclosing log root.
 * @returns the rejection reason, or undefined when removal may proceed.
 */
export declare function checkSessionDirectory(check: SessionDirCheck): SessionDirRejection | undefined;
