import { describe, it, expect } from 'vitest'
import { delayedLoading } from './delayedLoading'

describe('delayedLoading', () => {
  it('should export delayedLoading utility', () => {
    expect(delayedLoading).toBeDefined()
    expect(typeof delayedLoading).toBe('function')
  })

  it('should accept options parameter', () => {
    const util = delayedLoading({ delay: 500 })
    expect(util).toBeDefined()
  })

  it('should work with default options', () => {
    const util = delayedLoading()
    expect(util).toBeDefined()
  })

  it('should accept custom delay value', () => {
    const util = delayedLoading({ delay: 1000 })
    expect(util).toBeDefined()
  })
})
