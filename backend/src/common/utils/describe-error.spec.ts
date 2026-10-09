import { describe, expect, it } from 'vitest'
import { describeError } from './describe-error'

describe('describeError', () => {
  it("uses an Error's message", () => {
    expect(describeError(new Error('connection reset'))).toBe('connection reset')
  })

  it('passes a thrown string through', () => {
    expect(describeError('plain failure')).toBe('plain failure')
  })

  it('keeps the contents of a thrown object visible rather than [object Object]', () => {
    expect(describeError({ code: 'ETIMEDOUT', syscall: 'connect' })).toBe(
      '{"code":"ETIMEDOUT","syscall":"connect"}',
    )
  })

  it('names the values JSON cannot represent', () => {
    expect(describeError(undefined)).toBe('undefined')
    expect(describeError(null)).toBe('null')
    expect(describeError(() => 'nope')).toBe('unknown error')
  })
})
