import { Injectable, Logger } from '@nestjs/common'

/**
 * Queue Metrics Service
 *
 * Tracks queue worker performance metrics:
 * - Job completion count
 * - Job failure count
 * - Job duration (latency)
 * - Queue depth
 *
 * Metrics are exposed via logs for now. In production, integrate with Prometheus
 * or similar monitoring system.
 *
 * Future: Export metrics in Prometheus format (/metrics endpoint)
 */
@Injectable()
export class QueueMetricsService {
  private readonly logger = new Logger(QueueMetricsService.name)

  private metrics = {
    ingestionJobsCompleted: 0,
    ingestionJobsFailed: 0,
    ingestionJobTotalDuration: 0,
    ingestionJobMaxDuration: 0,
    ingestionJobMinDuration: Infinity,

    emailJobsCompleted: 0,
    emailJobsFailed: 0,
    emailJobTotalDuration: 0,
    emailJobMaxDuration: 0,
    emailJobMinDuration: Infinity,

    smsJobsCompleted: 0,
    smsJobsFailed: 0,
    smsJobTotalDuration: 0,
    smsJobMaxDuration: 0,
    smsJobMinDuration: Infinity,
  }

  /**
   * Record a job completion
   */
  recordJobCompleted(workerType: 'ingestion' | 'email' | 'sms', durationMs: number): void {
    const prefix = `${workerType}Job`

    this.metrics[`${prefix}sCompleted`]++
    this.metrics[`${prefix}TotalDuration`] += durationMs
    this.metrics[`${prefix}MaxDuration`] = Math.max(
      this.metrics[`${prefix}MaxDuration`],
      durationMs,
    )
    this.metrics[`${prefix}MinDuration`] = Math.min(
      this.metrics[`${prefix}MinDuration`],
      durationMs,
    )

    const avgDuration = (
      this.metrics[`${prefix}TotalDuration`] / this.metrics[`${prefix}sCompleted`]
    ).toFixed(2)

    this.logger.log(`${workerType} job completed (${durationMs}ms, avg: ${avgDuration}ms)`)
  }

  /**
   * Record a job failure
   */
  recordJobFailed(
    workerType: 'ingestion' | 'email' | 'sms',
    attempt: number,
    maxAttempts: number,
  ): void {
    const prefix = `${workerType}Job`
    this.metrics[`${prefix}Failed`]++

    const failurePercent = (
      (this.metrics[`${prefix}Failed`] /
        (this.metrics[`${prefix}sCompleted`] + this.metrics[`${prefix}Failed`])) *
      100
    ).toFixed(2)

    this.logger.warn(
      `❌ ${workerType} job failed (attempt ${attempt}/${maxAttempts}, failure rate: ${failurePercent}%)`,
    )
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): Record<string, any> {
    return {
      timestamp: new Date().toISOString(),
      ingestion: {
        completed: this.metrics.ingestionJobsCompleted,
        failed: this.metrics.ingestionJobsFailed,
        avgDuration:
          this.metrics.ingestionJobsCompleted > 0
            ? (
                this.metrics.ingestionJobTotalDuration / this.metrics.ingestionJobsCompleted
              ).toFixed(2)
            : 0,
        maxDuration:
          this.metrics.ingestionJobMaxDuration === 0 ? 'N/A' : this.metrics.ingestionJobMaxDuration,
        minDuration:
          this.metrics.ingestionJobMinDuration === Infinity
            ? 'N/A'
            : this.metrics.ingestionJobMinDuration,
      },
      email: {
        completed: this.metrics.emailJobsCompleted,
        failed: this.metrics.emailJobsFailed,
        avgDuration:
          this.metrics.emailJobsCompleted > 0
            ? (this.metrics.emailJobTotalDuration / this.metrics.emailJobsCompleted).toFixed(2)
            : 0,
        maxDuration:
          this.metrics.emailJobMaxDuration === 0 ? 'N/A' : this.metrics.emailJobMaxDuration,
        minDuration:
          this.metrics.emailJobMinDuration === Infinity ? 'N/A' : this.metrics.emailJobMinDuration,
      },
      sms: {
        completed: this.metrics.smsJobsCompleted,
        failed: this.metrics.smsJobsFailed,
        avgDuration:
          this.metrics.smsJobsCompleted > 0
            ? (this.metrics.smsJobTotalDuration / this.metrics.smsJobsCompleted).toFixed(2)
            : 0,
        maxDuration: this.metrics.smsJobMaxDuration === 0 ? 'N/A' : this.metrics.smsJobMaxDuration,
        minDuration:
          this.metrics.smsJobMinDuration === Infinity ? 'N/A' : this.metrics.smsJobMinDuration,
      },
    }
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  reset(): void {
    this.metrics = {
      ingestionJobsCompleted: 0,
      ingestionJobsFailed: 0,
      ingestionJobTotalDuration: 0,
      ingestionJobMaxDuration: 0,
      ingestionJobMinDuration: Infinity,

      emailJobsCompleted: 0,
      emailJobsFailed: 0,
      emailJobTotalDuration: 0,
      emailJobMaxDuration: 0,
      emailJobMinDuration: Infinity,

      smsJobsCompleted: 0,
      smsJobsFailed: 0,
      smsJobTotalDuration: 0,
      smsJobMaxDuration: 0,
      smsJobMinDuration: Infinity,
    }
    this.logger.log('Metrics reset')
  }
}
