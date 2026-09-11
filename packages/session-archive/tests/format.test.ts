/**
 * The two formatters this plugin took ownership of.
 *
 * They are reimplementations of host helpers, so the point of pinning them is
 * not that the arithmetic is clever — it is that the archive area keeps
 * reading exactly like the rest of DSH now that nothing enforces that from
 * the outside. Each case below is a boundary the host's own implementation
 * turns on.
 */

import { describe, expect, it } from 'vitest'

import { fileSizeText, relativeTime } from '../src/client/format.js'

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

describe('fileSizeText', () => {
  it('stays in bytes below a kilobyte, with no decimal', () => {
    expect(fileSizeText(0)).toBe('0B')
    expect(fileSizeText(312)).toBe('312B')
    expect(fileSizeText(1023)).toBe('1023B')
  })

  it('switches unit exactly at 1024, not at 1000', () => {
    expect(fileSizeText(1024)).toBe('1.0KB')
    expect(fileSizeText(1024 * 1024)).toBe('1.0MB')
    expect(fileSizeText(1024 ** 3)).toBe('1.0GB')
  })

  it('keeps one decimal below ten of a unit and drops it above', () => {
    expect(fileSizeText(1024 * 4.25)).toBe('4.3KB')
    // Ten of a unit is where the decimal stops carrying information.
    expect(fileSizeText(1024 * 9.9)).toBe('9.9KB')
    expect(fileSizeText(1024 * 10)).toBe('10KB')
    expect(fileSizeText(1024 * 37)).toBe('37KB')
    expect(fileSizeText(1024 * 1023.6)).toBe('1024KB')
  })

  it('has no unit above gigabytes, so large values keep growing there', () => {
    expect(fileSizeText(1024 ** 4)).toBe('1024GB')
  })
})

describe('relativeTime', () => {
  const now = 1_700_000_000_000

  it('buckets by the largest unit that fits', () => {
    expect(relativeTime(now, now)).toEqual({ unit: 'now', n: 0 })
    expect(relativeTime(now - 5 * MINUTE, now)).toEqual({ unit: 'minutes', n: 5 })
    expect(relativeTime(now - 3 * HOUR, now)).toEqual({ unit: 'hours', n: 3 })
    expect(relativeTime(now - 2 * DAY, now)).toEqual({ unit: 'days', n: 2 })
    expect(relativeTime(now - 60 * DAY, now)).toEqual({ unit: 'months', n: 2 })
    expect(relativeTime(now - 400 * DAY, now)).toEqual({ unit: 'years', n: 1 })
  })

  it('promotes a unit only once the next one is fully reached', () => {
    expect(relativeTime(now - (MINUTE - 1), now).unit).toBe('now')
    expect(relativeTime(now - MINUTE, now)).toEqual({ unit: 'minutes', n: 1 })
    expect(relativeTime(now - (HOUR - 1), now).unit).toBe('minutes')
    expect(relativeTime(now - (30 * DAY - 1), now).unit).toBe('days')
    expect(relativeTime(now - 30 * DAY, now)).toEqual({ unit: 'months', n: 1 })
  })

  it('reads a stamp from the future as now rather than going negative', () => {
    // Clock skew between the host that wrote the stamp and the browser
    // reading it is ordinary, and "-3 分钟前" is not a thing to show anyone.
    expect(relativeTime(now + 10 * DAY, now)).toEqual({ unit: 'now', n: 0 })
  })
})
