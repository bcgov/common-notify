import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EMPTY, Observable, asyncScheduler, share, throttleTime } from 'rxjs'
import { QueueName } from '../../../enum/queue-name.enum'
import { createRedisClient } from '../../../queue/redis-connection'
import type { RedisConfig } from '../../../queue/redis-connection'
import { bullKey } from '../../../queue/queue-metrics'

/** Coalesces bursts: a 5,000-recipient batch reports progress per recipient. */
export const CHANGE_THROTTLE_MS = 2_000

/**
 * Signals that queue state has changed so the admin monitoring page can refetch its snapshot.
 *
 * Bull publishes every add, start, progress update, completion and failure on channels under
 * `<prefix>:<queue>:`, from whichever pod did the work, so one pattern subscription per queue
 * hears all of them. The subscriber connection exists only while at least one admin has the page
 * open: share() opens it for the first stream and closes it when the last one ends.
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

    const patterns = Object.values(QueueName).map((name) => bullKey(name, '*'))
    this.changes$ = new Observable<void>((subscriber) => {
      const redis = createRedisClient(redisConfig, 'MonitoringEvents')
      redis.on('pmessage', () => subscriber.next())
      redis.psubscribe(...patterns).catch((error: Error) => {
        this.logger.error(`Failed to subscribe to queue events: ${error.message}`)
      })
      return () => {
        redis.quit().catch(() => redis.disconnect())
      }
    }).pipe(
      throttleTime(CHANGE_THROTTLE_MS, asyncScheduler, { leading: true, trailing: true }),
      share(),
    )
  }
}
