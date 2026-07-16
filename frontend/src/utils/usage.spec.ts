import { describe, it, expect } from 'vitest'
import { formatChannel, percentOf } from './usage'

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
