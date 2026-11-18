import { describe, it, expect } from 'vitest'
import type { ConfigService } from '@nestjs/config'
import { jobPriority, requestPriority } from './job-priority'

describe('jobPriority', () => {
  it('falls back to 1, 5 and 10 without config', () => {
    expect(jobPriority('high')).toBe(1)
    expect(jobPriority('normal')).toBe(5)
    expect(jobPriority('low')).toBe(10)
  })

  it('reads each level from queue.priority', () => {
    const config = { get: (key: string) => ({ 'queue.priority.low': 50 })[key] }
    expect(jobPriority('low', config as unknown as ConfigService)).toBe(50)
    expect(jobPriority('high', config as unknown as ConfigService)).toBe(1)
  })
})

describe('requestPriority', () => {
  it('defaults a simple send to normal and a merge to low', () => {
    expect(requestPriority({}, false)).toBe('normal')
    expect(requestPriority(undefined, true)).toBe('low')
  })

  it('uses the priority the request asked for', () => {
    expect(requestPriority({ priority: 'high' }, true)).toBe('high')
    expect(requestPriority({ priority: 'low' }, false)).toBe('low')
  })

  it('uses the email channel’s priority when the request sets none', () => {
    expect(requestPriority({ email: { priority: 'high' } }, true)).toBe('high')
  })

  it('prefers the request’s priority to the email channel’s', () => {
    expect(requestPriority({ priority: 'low', email: { priority: 'high' } }, false)).toBe('low')
  })
})
