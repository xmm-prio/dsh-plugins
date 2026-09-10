import { describe, expect, it } from 'vitest'

import { MAX_SESSION_ID_LENGTH, validateSessionId } from '../src/domain/session-id.js'

describe('validateSessionId', () => {
  it('accepts an ordinary host-minted session id', () => {
    expect(validateSessionId('01JBQ8Z9K7N4X2VYE3M6T5H0AB')).toBeUndefined()
    expect(validateSessionId('sess-123_abc.def~x')).toBeUndefined()
  })

  it('rejects an empty id', () => {
    expect(validateSessionId('')).toBe('empty')
  })

  it('rejects an id longer than one filesystem segment', () => {
    expect(validateSessionId('a'.repeat(MAX_SESSION_ID_LENGTH))).toBeUndefined()
    expect(validateSessionId('a'.repeat(MAX_SESSION_ID_LENGTH + 1))).toBe('too-long')
  })

  it('rejects both path separator flavours anywhere in the id', () => {
    expect(validateSessionId('a/b')).toBe('path-separator')
    expect(validateSessionId('a\\b')).toBe('path-separator')
    expect(validateSessionId('/abc')).toBe('path-separator')
    expect(validateSessionId('abc\\')).toBe('path-separator')
    expect(validateSessionId('../../etc/passwd')).toBe('path-separator')
  })

  it('rejects a NUL byte', () => {
    expect(validateSessionId('abc\u0000def')).toBe('nul')
  })

  it('rejects the relative directory segments', () => {
    expect(validateSessionId('.')).toBe('dot-segment')
    expect(validateSessionId('..')).toBe('dot-segment')
  })

  it('accepts an id that merely starts with a dot', () => {
    expect(validateSessionId('.hidden')).toBeUndefined()
  })

  it('rejects other control characters', () => {
    expect(validateSessionId('abc\ndef')).toBe('control-character')
    expect(validateSessionId('abc\u007f')).toBe('control-character')
  })

  it('rejects a Windows drive-relative id', () => {
    expect(validateSessionId('C:abc')).toBe('drive-letter')
  })
})
