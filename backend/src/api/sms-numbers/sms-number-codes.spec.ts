import { describe, expect, it } from 'vitest'
import { numberTypeMismatch } from './sms-number-codes'

describe('numberTypeMismatch', () => {
  it.each([
    ['+15551234567', 'long_code'],
    ['+18005551234', 'toll_free'],
    ['+18885551234', 'toll_free'],
    ['12345', 'short_code'],
    ['123456', 'short_code'],
    ['+15551234567', 'rcs'],
    ['12345', 'rcs'],
  ])('accepts %s as %s', (phoneNumber, type) => {
    expect(numberTypeMismatch(phoneNumber, type)).toBeNull()
  })

  it.each([
    ['12345', 'long_code'],
    ['+15551234567', 'toll_free'],
    ['+1800555123', 'toll_free'],
    ['+15551234567', 'short_code'],
    ['1234', 'short_code'],
  ])('rejects %s as %s, saying what fits', (phoneNumber, type) => {
    expect(numberTypeMismatch(phoneNumber, type)).toMatch(/does not fit its type: enter /)
  })
})
