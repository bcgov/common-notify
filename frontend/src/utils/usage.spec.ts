import { describe, it, expect } from 'vitest'
import {
  adoptionSummaryText,
  formatChannel,
  formatFailures,
  formatLastSent,
  percentOf,
} from './usage'

describe('formatChannel', () => {
  it('title-cases a channel code', () => {
    expect(formatChannel('EMAIL')).toBe('Email')
    expect(formatChannel('sms')).toBe('Sms')
  })
})

describe('percentOf', () => {
  it('rounds to five decimal places', () => {
    expect(percentOf(1, 3)).toBe(33.33333)
    expect(percentOf(2, 3)).toBe(66.66667)
    expect(percentOf(47, 50000)).toBe(0.094)
  })

  it('returns whole percentages without trailing zeros', () => {
    expect(percentOf(1, 2)).toBe(50)
    expect(percentOf(1, 1)).toBe(100)
  })

  it('guards against a zero or invalid limit', () => {
    expect(percentOf(5, 0)).toBe(0)
    expect(percentOf(5, -10)).toBe(0)
  })
})

describe('adoptionSummaryText', () => {
  it('joins the three counts, with thousands separators', () => {
    expect(
      adoptionSummaryText({ tenants: 1200, sentThisFiscalYear: 30, withApiKey: 0, disabled: 0 }),
    ).toBe('1,200 tenants use Notify · 30 sent this fiscal year · 0 with an API key')
  })

  it('adds the disabled count only when there are any', () => {
    expect(
      adoptionSummaryText({ tenants: 42, sentThisFiscalYear: 30, withApiKey: 12, disabled: 2 }),
    ).toBe('42 tenants use Notify · 30 sent this fiscal year · 12 with an API key · 2 disabled')
  })

  it('reads naturally for a single tenant', () => {
    expect(
      adoptionSummaryText({ tenants: 1, sentThisFiscalYear: 1, withApiKey: 1, disabled: 0 }),
    ).toBe('1 tenant uses Notify · 1 sent this fiscal year · 1 with an API key')
  })
})

describe('formatLastSent', () => {
  const now = new Date('2026-11-06T18:00:00Z').getTime()

  it.each([
    ['2026-11-06T09:00:00Z', 'Today'],
    ['2026-11-05T12:00:00Z', 'Yesterday'],
    ['2026-10-25T18:00:00Z', '12 days ago'],
    ['2026-08-15T18:00:00Z', 'Aug 15, 2026'],
  ])('describes %s as %s', (iso, expected) => {
    expect(formatLastSent(iso, now)).toBe(expected)
  })
})

describe('formatFailures', () => {
  it.each([
    [0, 0, '0'],
    [0, 500, '0'],
    [12, 3000, '12 (0.4%)'],
    [1500, 3000, '1,500 (50%)'],
  ])('%i of %i → %s', (failed, recipients, expected) => {
    expect(formatFailures(failed, recipients)).toBe(expected)
  })
})
