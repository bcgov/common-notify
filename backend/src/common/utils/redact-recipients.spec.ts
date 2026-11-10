import { describe, expect, it } from 'vitest'
import { redactRecipients, redactValue } from './redact-recipients'

describe('redactRecipients', () => {
  it('hides email addresses and phone numbers in error text', () => {
    expect(
      redactRecipients('550 5.1.1 <Jane.Doe+x@gov.bc.ca>: mailbox unavailable, cc a@b.ca'),
    ).toBe('550 5.1.1 <[email]>: mailbox unavailable, cc [email]')
    expect(redactRecipients('Invalid To number +12505550123 and (250) 555-0123')).toBe(
      'Invalid To number [phone] and [phone]',
    )
  })

  it('hides a known address the patterns would miss, case-insensitively', () => {
    expect(redactRecipients('Rejected 2505550123 (code 21211)', ['2505550123'])).toBe(
      'Rejected [recipient] (code 21211)',
    )
    expect(redactRecipients('bounce for USER@EXAMPLE.CA', ['user@example.ca'])).toBe(
      'bounce for [recipient]',
    )
  })

  it('leaves timestamps, ids and status codes alone', () => {
    const text = 'CHES 422 at 2026-11-10T10:42:00Z txId 0d2c6a3e-1f4b-4c8d-9e7a-5b6c7d8e9f01'
    expect(redactRecipients(text)).toBe(text)
  })
})

describe('redactValue', () => {
  it('serializes objects, and returns null for nothing', () => {
    expect(redactValue({ to: 'a@b.ca', code: 400 })).toBe('{"to":"[email]","code":400}')
    expect(redactValue(null)).toBeNull()
    expect(redactValue('')).toBeNull()
  })
})
