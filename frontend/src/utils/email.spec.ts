import { describe, expect, it } from 'vitest'
import { isValidEmail } from './email'

describe('isValidEmail', () => {
  it.each(['user@gov.bc.ca', 'first.last+tag@example.com', 'a@b.co'])('accepts %s', (value) => {
    expect(isValidEmail(value)).toBe(true)
  })

  it.each(['', 'user', 'user@', '@gov.bc.ca', 'user@localhost', 'first..last@gov.bc.ca'])(
    'rejects %j',
    (value) => {
      expect(isValidEmail(value)).toBe(false)
    },
  )

  it('rejects an address longer than 254 characters', () => {
    expect(isValidEmail(`${'a'.repeat(64)}@${'b'.repeat(186)}.com`)).toBe(false)
  })
})
