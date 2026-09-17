import { describe, expect, it } from 'vitest'
import { trimChar, trimCharEnd, trimCharStart } from './trim-char'

describe('trimChar', () => {
  it('strips runs of the character from both ends only', () => {
    expect(trimChar('//a/b//', '/')).toBe('a/b')
  })

  it('returns an empty string when the value is only that character', () => {
    expect(trimChar('////', '/')).toBe('')
  })

  it('leaves a value without the character unchanged', () => {
    expect(trimChar('abc', '/')).toBe('abc')
    expect(trimChar('', '/')).toBe('')
  })

  it('handles a long run without slowing down', () => {
    const value = '/'.repeat(100_000) + 'x'
    expect(trimChar(value, '/')).toBe('x')
  })
})

describe('trimCharStart / trimCharEnd', () => {
  it('strips only the named side', () => {
    expect(trimCharStart('//a//', '/')).toBe('a//')
    expect(trimCharEnd('//a//', '/')).toBe('//a')
  })
})
