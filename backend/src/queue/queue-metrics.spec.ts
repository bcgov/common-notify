import { describe, it, expect, vi } from 'vitest'
import type Bull from 'bull'
import {
  MONITORING_WINDOW_MINUTES,
  addedCounterKey,
  alignBullMetrics,
  countAddedJobs,
  minuteOf,
} from './queue-metrics'

const MINUTE = 60_000

describe('alignBullMetrics', () => {
  const now = 1_000 * MINUTE + 30_000

  it('returns a zeroed window when the queue has never finished a job', () => {
    const series = alignBullMetrics({ meta: { count: 0, prevTS: 0, prevCount: 0 }, data: [] }, now)
    expect(series).toHaveLength(MONITORING_WINDOW_MINUTES)
    expect(series.every((value) => value === 0)).toBe(true)
  })

  it('puts unflushed jobs in the current minute and flushed points behind it', () => {
    const series = alignBullMetrics(
      { meta: { count: 12, prevTS: now - 5_000, prevCount: 9 }, data: ['4', '7'] },
      now,
    )
    expect(series.at(-1)).toBe(3)
    expect(series.at(-2)).toBe(4)
    expect(series.at(-3)).toBe(7)
  })

  it('anchors points to the last flush, not to now, when the queue has gone quiet', () => {
    // Last job finished three minutes ago; Bull has not written a point since.
    const series = alignBullMetrics(
      { meta: { count: 10, prevTS: now - 3 * MINUTE, prevCount: 8 }, data: ['5'] },
      now,
    )
    expect(series.slice(-3)).toEqual([0, 0, 0])
    expect(series.at(-4)).toBe(2)
    expect(series.at(-5)).toBe(5)
  })
})

describe('countAddedJobs', () => {
  function fakeQueue() {
    const exec = vi.fn().mockResolvedValue([])
    const multi = { incr: vi.fn(), expire: vi.fn(), exec }
    multi.incr.mockReturnValue(multi)
    multi.expire.mockReturnValue(multi)
    const job = { id: '1' }
    const queue = {
      name: 'email-delivery',
      add: vi.fn().mockResolvedValue(job),
      client: { multi: vi.fn(() => multi) },
    }
    return { queue, multi, job, exec }
  }

  it('increments the current minute counter after a job is added', async () => {
    const { queue, multi, job } = fakeQueue()
    countAddedJobs(queue as unknown as Bull.Queue)

    await expect(queue.add({ notifyId: 'n1' })).resolves.toBe(job)

    const key = addedCounterKey('email-delivery', minuteOf(Date.now()))
    expect(multi.incr).toHaveBeenCalledWith(key)
    expect(multi.expire).toHaveBeenCalledWith(key, expect.any(Number))
  })

  it('does not fail the add when counting fails', async () => {
    const { queue, job, exec } = fakeQueue()
    exec.mockRejectedValue(new Error('redis down'))
    countAddedJobs(queue as unknown as Bull.Queue)

    await expect(queue.add({})).resolves.toBe(job)
  })

  it('does not count a job whose add failed', async () => {
    const { queue, multi } = fakeQueue()
    queue.add.mockRejectedValue(new Error('OOM command not allowed'))
    countAddedJobs(queue as unknown as Bull.Queue)

    await expect(queue.add({})).rejects.toThrow('OOM')
    expect(multi.incr).not.toHaveBeenCalled()
  })
})
