import { describe, expect, it } from 'vitest'
import {
  duplicatePhoneNumbers,
  isInternationalPhone,
  isValidPhone,
  normalizePhone,
} from './phoneNumbers'

describe('normalizePhone', () => {
  it.each(['2505551234', '250-555-1234', '(250) 555-1234', '250.555.1234', '+1 250 555 1234'])(
    'normalizes %s to E.164',
    (value) => {
      expect(normalizePhone(value)).toBe('+12505551234')
    },
  )

  it.each(['', '123', 'not a number', '250-555-1234 ext. 5'])('rejects %j', (value) => {
    expect(normalizePhone(value)).toBeNull()
  })
})

describe('isValidPhone', () => {
  it('follows normalizePhone', () => {
    expect(isValidPhone('250-555-1234')).toBe(true)
    expect(isValidPhone('123')).toBe(false)
  })
})

describe('isInternationalPhone', () => {
  it('treats Canadian numbers as domestic', () => {
    expect(isInternationalPhone('250-555-1234')).toBe(false)
  })

  it('treats US numbers as international', () => {
    expect(isInternationalPhone('+1 212 555 1234')).toBe(true)
  })

  it('is false for a number that will not normalize', () => {
    expect(isInternationalPhone('123')).toBe(false)
  })
})

describe('duplicatePhoneNumbers', () => {
  it('flags later entries that normalize to an earlier number', () => {
    expect(duplicatePhoneNumbers(['2505551234', '250-555-1234', '(250) 555-1234'])).toEqual([
      '250-555-1234',
      '(250) 555-1234',
    ])
  })

  it('ignores numbers that will not normalize', () => {
    expect(duplicatePhoneNumbers(['123', '123'])).toEqual([])
  })
})
