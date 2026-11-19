import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, formatDateTime, localDay } from './dates'

describe('dates', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats a date, and a timestamp to the second', () => {
    expect(formatDate('2026-11-09T12:00:00')).toBe('Nov 9, 2026')
    expect(formatDateTime('2026-11-09T15:22:45')).toMatch(/^Nov 9, 2026, 3:22:45/)
    expect(formatDateTime(null)).toBe('-')
  })

  it('gives a local day as YYYY-MM-DD, counting back across a month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-03T09:00:00'))
    expect(localDay()).toBe('2026-11-03')
    expect(localDay(6)).toBe('2026-10-28')
  })
})
