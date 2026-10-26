import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EMPTY, Observable, asyncScheduler, share, throttleTime } from 'rxjs'
import { QueueName } from '../../../enum/queue-name.enum'
import { createQueueEvents } from '../../../queue/redis-connection'
import type { RedisConfig } from '../../../queue/redis-connection'

/** The job events that change what the monitoring page shows. */
export const QUEUE_CHANGE_EVENTS = [
  'added',
  'waiting',
  'delayed',
  'active',
  'progress',
  'completed',
  'failed',
  'stalled',
  'removed',
] as const

/** Coalesces bursts: a 5,000-recipient batch reports progress per recipient. */
export const CHANGE_THROTTLE_MS = 2_000

/**
 * Signals that queue state has changed so the admin monitoring page can refetch its snapshot.
 *
 * BullMQ writes every add, start, progress update, completion and failure to each queue's events
 * stream, from whichever pod did the work, so one QueueEvents reader per queue hears all of them.
 * The readers exist only while at least one admin has the page open: share() opens them for the
 * first stream and closes them when the last one ends.
 */
@Injectable()
export class MonitoringEventsService {
  private readonly logger = new Logger(MonitoringEventsService.name)
  readonly changes$: Observable<void>

  constructor(configService: ConfigService) {
    const redisConfig = configService.get<RedisConfig>('redis')
    if (!redisConfig) {
      this.changes$ = EMPTY
      return
    }

    this.changes$ = new Observable<void>((subscriber) => {
      const readers = Object.values(QueueName).map((name) => {
        const events = createQueueEvents(name, redisConfig)
        for (const event of QUEUE_CHANGE_EVENTS) events.on(event, () => subscriber.next())
        return events
      })
      return () => {
        for (const events of readers) {
          events.close().catch((error: Error) => {
            this.logger.warn(`Failed to close queue events reader: ${error.message}`)
          })
        }
      }
    }).pipe(
      throttleTime(CHANGE_THROTTLE_MS, asyncScheduler, { leading: true, trailing: true }),
      share(),
    )
  }
}
