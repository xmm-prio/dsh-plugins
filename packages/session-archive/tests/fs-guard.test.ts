import { describe, expect, it } from 'vitest'

import { checkSessionDirectory, isFilesystemRoot, isStrictlyInside } from '../src/domain/fs-guard.js'

describe('isFilesystemRoot', () => {
  it('recognises the POSIX root', () => {
    expect(isFilesystemRoot('/')).toBe(true)
    expect(isFilesystemRoot('//')).toBe(true)
    expect(isFilesystemRoot('/sessions')).toBe(false)
  })

  it('recognises Windows drive roots in both separator flavours', () => {
    expect(isFilesystemRoot('C:\\')).toBe(true)
    expect(isFilesystemRoot('c:/')).toBe(true)
    expect(isFilesystemRoot('C:')).toBe(true)
    expect(isFilesystemRoot('C:\\sessions')).toBe(false)
  })

  it('recognises UNC share roots', () => {
    expect(isFilesystemRoot('\\\\server\\share')).toBe(true)
    expect(isFilesystemRoot('\\\\server\\share\\')).toBe(true)
    expect(isFilesystemRoot('//server/share')).toBe(true)
    expect(isFilesystemRoot('\\\\server\\share\\sessions')).toBe(false)
  })

  it('recognises extended-length prefixed roots', () => {
    expect(isFilesystemRoot('\\\\?\\C:\\')).toBe(true)
    expect(isFilesystemRoot('\\\\?\\UNC\\server\\share')).toBe(true)
    expect(isFilesystemRoot('\\\\?\\C:\\sessions')).toBe(false)
  })

  it('treats an empty or relative path as not a root', () => {
    expect(isFilesystemRoot('')).toBe(false)
    expect(isFilesystemRoot('sessions')).toBe(false)
    expect(isFilesystemRoot('.')).toBe(false)
  })
})

describe('isStrictlyInside', () => {
  it('accepts a real descendant', () => {
    expect(isStrictlyInside('/root', '/root/a/b')).toBe(true)
    expect(isStrictlyInside('C:\\root', 'C:\\root\\a\\b')).toBe(true)
  })

  it('rejects the parent itself', () => {
    expect(isStrictlyInside('/root', '/root')).toBe(false)
    expect(isStrictlyInside('C:\\root', 'C:\\root\\')).toBe(false)
  })

  it('rejects a sibling whose name merely shares a prefix', () => {
    expect(isStrictlyInside('/root/abc', '/root/abcdef')).toBe(false)
    expect(isStrictlyInside('C:\\root\\abc', 'C:\\root\\abcdef')).toBe(false)
  })

  it('rejects an escape above the parent', () => {
    expect(isStrictlyInside('/root/a', '/root')).toBe(false)
    expect(isStrictlyInside('/root', '/other/a')).toBe(false)
  })

  it('compares Windows paths case-insensitively and separator-insensitively', () => {
    expect(isStrictlyInside('C:\\Root', 'c:/root/a')).toBe(true)
  })

  it('compares POSIX paths case-sensitively', () => {
    expect(isStrictlyInside('/Root', '/root/a')).toBe(false)
  })
})

describe('checkSessionDirectory', () => {
  const id = 'abc'

  it('accepts a directory named after the session below a root', () => {
    expect(checkSessionDirectory({ dir: '/sessions/proj/abc', sessionId: id, root: '/sessions' })).toBeUndefined()
  })

  it('refuses a relative directory', () => {
    expect(checkSessionDirectory({ dir: 'sessions/abc', sessionId: id })).toBe('not-absolute')
  })

  it('refuses every filesystem root even when the id would match', () => {
    expect(checkSessionDirectory({ dir: '/', sessionId: id })).toBe('filesystem-root')
    expect(checkSessionDirectory({ dir: 'C:\\', sessionId: id })).toBe('filesystem-root')
    expect(checkSessionDirectory({ dir: '\\\\server\\share', sessionId: id })).toBe('filesystem-root')
  })

  it('refuses a directory whose name only shares a prefix with the session id', () => {
    expect(checkSessionDirectory({ dir: '/sessions/proj/abcdef', sessionId: id, root: '/sessions' })).toBe(
      'foreign-basename',
    )
  })

  it('refuses a directory outside the configured root', () => {
    expect(checkSessionDirectory({ dir: '/elsewhere/abc', sessionId: id, root: '/sessions' })).toBe('outside-root')
  })

  it('refuses the configured root itself', () => {
    expect(checkSessionDirectory({ dir: '/sessions', sessionId: 'sessions', root: '/sessions' })).toBe('outside-root')
  })

  it('refuses an inadmissible session id before looking at the path', () => {
    expect(checkSessionDirectory({ dir: '/sessions/proj/..', sessionId: '..', root: '/sessions' })).toBe(
      'invalid-session-id',
    )
  })

  it('skips the containment check when no root is known', () => {
    expect(checkSessionDirectory({ dir: '/anywhere/deep/abc', sessionId: id })).toBeUndefined()
  })

  it('skips the basename check when the directory name is not claimed to be the id', () => {
    expect(checkSessionDirectory({ dir: '/sessions/proj/--encoded--', root: '/sessions' })).toBeUndefined()
    expect(checkSessionDirectory({ dir: '/', root: '/sessions' })).toBe('filesystem-root')
  })

  it('refuses a directory sitting directly at a filesystem root', () => {
    expect(checkSessionDirectory({ dir: '/abc', sessionId: id })).toBe('shallow')
    expect(checkSessionDirectory({ dir: 'C:\\abc', sessionId: id })).toBe('shallow')
  })
})
