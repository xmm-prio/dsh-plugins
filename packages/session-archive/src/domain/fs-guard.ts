/**
 * Platform-independent path guards for the irreversible delete path.
 *
 * `node:path` answers for the host it runs on, which is the wrong authority
 * here: the guard must refuse a Windows-shaped path even when the process is
 * POSIX, so that a mistake cannot hide until the archive set is opened on the
 * other platform. Everything below therefore parses the path string itself.
 */

import { validateSessionId } from './session-id.js'

type PathFlavour = 'posix' | 'windows'

interface ParsedPath {
  readonly flavour: PathFlavour
  /** Comparison-normalized volume root: `/`, `c:`, or `//server/share`. */
  readonly root: string
  /** Path segments below the root, with empties collapsed. */
  readonly segments: readonly string[]
}

const SEPARATORS = /[\\/]+/

/** Split the tail of an absolute path into non-empty segments. */
function splitSegments(tail: string): string[] {
  return tail.split(SEPARATORS).filter((segment) => segment.length > 0)
}

/**
 * Parse an absolute path without consulting the host platform.
 * @param value - candidate absolute path in either separator flavour.
 * @returns the parsed path, or undefined when the value is relative or empty.
 */
function parseAbsolutePath(value: string): ParsedPath | undefined {
  if (value.length === 0) return undefined

  let rest = value
  let extended = false
  if (/^[\\/]{2}[?.][\\/]/.test(rest)) {
    rest = rest.slice(4)
    extended = true
  }

  const uncPrefix = extended ? /^UNC[\\/]+([^\\/]+)[\\/]+([^\\/]+)/i : /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)/
  const unc = uncPrefix.exec(rest)
  if (unc !== null) {
    return {
      flavour: 'windows',
      root: `//${unc[1]!.toLowerCase()}/${unc[2]!.toLowerCase()}`,
      segments: splitSegments(rest.slice(unc[0].length)),
    }
  }

  const drive = /^([A-Za-z]):/.exec(rest)
  if (drive !== null) {
    return { flavour: 'windows', root: `${drive[1]!.toLowerCase()}:`, segments: splitSegments(rest.slice(2)) }
  }

  if (extended) return undefined
  if (rest.startsWith('/')) return { flavour: 'posix', root: '/', segments: splitSegments(rest) }
  return undefined
}

/** Fold a segment for comparison under the flavour's filename casing rules. */
function fold(flavour: PathFlavour, segment: string): string {
  return flavour === 'windows' ? segment.toLowerCase() : segment
}

/**
 * Whether a path addresses a volume root with nothing below it.
 * @param value - candidate path in either separator flavour.
 * @returns true for `/`, `C:\`, `\\server\share`, and their extended-length forms.
 */
export function isFilesystemRoot(value: string): boolean {
  const parsed = parseAbsolutePath(value)
  return parsed !== undefined && parsed.segments.length === 0
}

/**
 * Whether one absolute path is a proper descendant of another.
 *
 * Segment-wise comparison, never string prefixing: `/root/abcdef` is not inside
 * `/root/abc`, and a path is never inside itself.
 * @param parent - candidate ancestor directory.
 * @param child - candidate descendant path.
 * @returns true only for a strict containment relation.
 */
export function isStrictlyInside(parent: string, child: string): boolean {
  const outer = parseAbsolutePath(parent)
  const inner = parseAbsolutePath(child)
  if (outer === undefined || inner === undefined) return false
  if (outer.flavour !== inner.flavour || outer.root !== inner.root) return false
  if (inner.segments.length <= outer.segments.length) return false
  return outer.segments.every((segment, index) => fold(outer.flavour, segment) === fold(inner.flavour, inner.segments[index]!))
}

/** Why a directory may not be handed to the recursive remover. */
export type SessionDirRejection =
  | 'invalid-session-id'
  | 'not-absolute'
  | 'filesystem-root'
  | 'outside-root'
  | 'shallow'
  | 'foreign-basename'

/** What the guard is asked to vouch for. */
export interface SessionDirCheck {
  /** Absolute directory that would be removed. */
  readonly dir: string
  /**
   * Session the directory is claimed to belong to. Supply it only when the
   * directory name is expected to be the id verbatim — that holds for a path
   * this plugin composed itself, not for a path the persistence backend
   * resolved through its own segment encoder.
   */
  readonly sessionId?: string | undefined
  /** Session log root the directory must live under, when one is known. */
  readonly root?: string | undefined
}

/**
 * Decide whether a directory may be removed as one session's log directory.
 * @param check - the directory, its claimed owner, and the enclosing log root.
 * @returns the rejection reason, or undefined when removal may proceed.
 */
export function checkSessionDirectory(check: SessionDirCheck): SessionDirRejection | undefined {
  if (check.sessionId !== undefined && validateSessionId(check.sessionId) !== undefined) return 'invalid-session-id'

  const parsed = parseAbsolutePath(check.dir)
  if (parsed === undefined) return 'not-absolute'
  if (parsed.segments.length === 0) return 'filesystem-root'
  if (check.root !== undefined && !isStrictlyInside(check.root, check.dir)) return 'outside-root'
  if (parsed.segments.length < 2) return 'shallow'
  if (check.sessionId !== undefined && parsed.segments[parsed.segments.length - 1] !== check.sessionId) {
    return 'foreign-basename'
  }
  return undefined
}
