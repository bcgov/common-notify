import { isSafelistChannel, isValidRecipient, normalizeRecipient } from './safelist.util'

describe('normalizeRecipient', () => {
  it('lowercases and trims email addresses so casing cannot bypass the safelist', () => {
    expect(normalizeRecipient('EMAIL', '  Person@GOV.BC.CA ')).toBe('person@gov.bc.ca')
    expect(normalizeRecipient('EMAIL', 'person@gov.bc.ca')).toBe('person@gov.bc.ca')
  })

  it('reduces North American phone numbers to a single E.164 form', () => {
    const expected = '+12505550100'
    expect(normalizeRecipient('SMS', '(250) 555-0100')).toBe(expected)
    expect(normalizeRecipient('SMS', '250-555-0100')).toBe(expected)
    expect(normalizeRecipient('SMS', '250 555 0100')).toBe(expected)
    expect(normalizeRecipient('SMS', '12505550100')).toBe(expected)
    expect(normalizeRecipient('SMS', '+1 (250) 555-0100')).toBe(expected)
  })

  it('keeps international numbers behind a +', () => {
    expect(normalizeRecipient('SMS', '+44 20 7946 0958')).toBe('+442079460958')
  })

  it('returns null for values that cannot be normalized', () => {
    expect(normalizeRecipient('EMAIL', '   ')).toBeNull()
    expect(normalizeRecipient('SMS', '')).toBeNull()
    expect(normalizeRecipient('SMS', 'not-a-number')).toBeNull()
  })
})

describe('isValidRecipient', () => {
  it('accepts plausible email addresses', () => {
    expect(isValidRecipient('EMAIL', 'qa.mailbox@gov.bc.ca')).toBe(true)
    expect(isValidRecipient('EMAIL', 'first.last+tag@example.co.uk')).toBe(true)
  })

  it('rejects values that are not email addresses', () => {
    expect(isValidRecipient('EMAIL', 'not-an-email')).toBe(false)
    expect(isValidRecipient('EMAIL', 'missing@domain')).toBe(false)
    expect(isValidRecipient('EMAIL', 'two @spaces.com')).toBe(false)
  })

  it('accepts phone numbers of plausible length and rejects others', () => {
    expect(isValidRecipient('SMS', '(250) 555-0100')).toBe(true)
    expect(isValidRecipient('SMS', '+44 20 7946 0958')).toBe(true)
    expect(isValidRecipient('SMS', '555-0100')).toBe(false)
    expect(isValidRecipient('SMS', '1234567890123456')).toBe(false)
  })

  it('rejects channels the safelist does not cover', () => {
    expect(isValidRecipient('MSGAPP', 'anything')).toBe(false)
    expect(isSafelistChannel('MSGAPP')).toBe(false)
    expect(isSafelistChannel('EMAIL')).toBe(true)
    expect(isSafelistChannel('SMS')).toBe(true)
  })
})
