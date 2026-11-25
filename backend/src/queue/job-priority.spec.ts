import { describe, it, expect, vi } from 'vitest'
import type { ConfigService } from '@nestjs/config'
import { jobPriority, priorityLanesEnabled, requestPriority } from './job-priority'

const configWith = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService

describe('jobPriority', () => {
  it('falls back to 5, 10 and 15 without config', () => {
    expect(jobPriority('high')).toBe(5)
    expect(jobPriority('normal')).toBe(10)
    expect(jobPriority('low')).toBe(15)
  })

  it('reads each level from queue.priority', () => {
    const config = configWith({ 'queue.priority.low': 50 })
    expect(jobPriority('low', config)).toBe(50)
    expect(jobPriority('high', config)).toBe(5)
  })

  it.each([0, -1, 2_097_153, 2.5, Number.NaN])(
    'ignores %s, which BullMQ would reject or treat as no priority',
    (value) => {
      expect(jobPriority('low', configWith({ 'queue.priority.low': value }))).toBe(15)
    },
  )

  it('accepts BullMQ’s highest priority', () => {
    expect(jobPriority('low', configWith({ 'queue.priority.low': 2_097_152 }))).toBe(2_097_152)
  })
})

describe('priorityLanesEnabled', () => {
  it('reads the tenant’s notification_priority flag', async () => {
    const isEnabled = vi.fn().mockResolvedValue(true)
    await expect(priorityLanesEnabled({ isEnabled }, 'tenant-1')).resolves.toBe(true)
    expect(isEnabled).toHaveBeenCalledWith('notification_priority', 'tenant-1')
  })

  it('is off without a flag service', async () => {
    await expect(priorityLanesEnabled(undefined, 'tenant-1')).resolves.toBe(false)
  })
})

describe('requestPriority', () => {
  describe('with priority lanes on', () => {
    it('defaults a simple send to normal and a merge to low', () => {
      expect(requestPriority({}, false, true)).toBe('normal')
      expect(requestPriority(undefined, true, true)).toBe('low')
    })

    it('uses the priority the request asked for', () => {
      expect(requestPriority({ priority: 'high' }, true, true)).toBe('high')
      expect(requestPriority({ priority: 'low' }, false, true)).toBe('low')
    })

    it('uses the email channel’s priority when the request sets none', () => {
      expect(requestPriority({ email: { priority: 'high' } }, true, true)).toBe('high')
    })

    it('prefers the request’s priority to the email channel’s', () => {
      expect(requestPriority({ priority: 'low', email: { priority: 'high' } }, false, true)).toBe(
        'low',
      )
    })
  })

  describe('with priority lanes off', () => {
    it('queues a merge at normal, not behind single sends', () => {
      expect(requestPriority(undefined, true, false)).toBe('normal')
    })

    it('ignores a requested priority', () => {
      expect(requestPriority({ priority: 'high' }, false, false)).toBe('normal')
      expect(requestPriority({ email: { priority: 'low' } }, true, false)).toBe('normal')
    })
  })
})
