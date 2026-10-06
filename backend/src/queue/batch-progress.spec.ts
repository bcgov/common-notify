import { describe, it, expect, vi } from 'vitest'
import type Bull from 'bull'
import { batchProgressReporter, readBatchProgress } from './batch-progress'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('batchProgressReporter', () => {
  it('writes the progress to the job', async () => {
    const job = { id: '1', progress: vi.fn().mockResolvedValue(undefined) }
    batchProgressReporter(job as unknown as Bull.Job)({ sent: 3, failed: 1, total: 10 })
    await flush()
    expect(job.progress).toHaveBeenCalledWith({ sent: 3, failed: 1, total: 10 })
  })

  it('never throws into the send loop, even when the write fails synchronously', async () => {
    const job = {
      id: '1',
      progress: vi.fn(() => {
        throw new Error('not a function in this test double')
      }),
    }
    expect(() =>
      batchProgressReporter(job as unknown as Bull.Job)({ sent: 0, failed: 0, total: 1 }),
    ).not.toThrow()
    await flush()
  })

  it('swallows a rejected write', async () => {
    const job = { id: '1', progress: vi.fn().mockRejectedValue(new Error('redis down')) }
    batchProgressReporter(job as unknown as Bull.Job)({ sent: 0, failed: 0, total: 1 })
    await flush()
    expect(job.progress).toHaveBeenCalled()
  })
})

describe('readBatchProgress', () => {
  it('reads a merge batch progress object', () => {
    expect(readBatchProgress({ sent: 1, failed: 0, total: 5 })).toEqual({
      sent: 1,
      failed: 0,
      total: 5,
    })
  })

  it('returns null for Bull default progress and malformed values', () => {
    expect(readBatchProgress(0)).toBeNull()
    expect(readBatchProgress({ sent: '1', failed: 0, total: 5 })).toBeNull()
    expect(readBatchProgress(null)).toBeNull()
  })
})
