import type Bull from 'bull'
import { Logger } from '@nestjs/common'

/** How far a merge batch has got, stored as the Bull job's progress. */
export interface BatchProgress {
  sent: number
  failed: number
  total: number
}

export type BatchProgressReporter = (progress: BatchProgress) => void

const logger = new Logger('BatchProgress')

/**
 * Report a merge batch's per-recipient progress on its Bull job, so the admin monitoring page
 * can show "37 of 100" for a batch that is one job but many emails. Best-effort: the write is
 * not awaited and a failure is only logged, so progress never slows or fails a send.
 */
export function batchProgressReporter(job: Bull.Job): BatchProgressReporter {
  return (progress) => {
    // Deferred through then() so even a synchronous throw lands in catch, not in the send loop.
    Promise.resolve()
      .then(() => job.progress(progress))
      .catch((error: Error) => {
        logger.warn(`Failed to record progress for job ${job.id}: ${error.message}`)
      })
  }
}

/** Read a job's progress back, or null when it is not a merge batch's. */
export function readBatchProgress(value: unknown): BatchProgress | null {
  if (!value || typeof value !== 'object') return null
  const { sent, failed, total } = value as Record<string, unknown>
  if (typeof sent !== 'number' || typeof failed !== 'number' || typeof total !== 'number') {
    return null
  }
  return { sent, failed, total }
}
