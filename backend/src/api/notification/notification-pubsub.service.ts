import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { Observable, Subject } from 'rxjs'
import { NotificationRequestDto } from './schemas/notification-request'

/**
 * Broadcasts notification_request row changes to SSE subscribers via Redis pub/sub.
 * When a notification_request entry is created or updated, publish is called which emits
 * the entry onto the tenant's Redis channel, where it is picked up by the SSE stream and
 * transmitted to the frontend. This is fire and forget with no queueing involved.
 *
 * Each tenant gets an isolated channel: `notification:changed:{tenantId}`
 * One shared PSUBSCRIBE connection routes messages to per-tenant RxJS Subjects.
 * A separate publisher connection sends updates from any pod.
 */
@Injectable()
export class NotificationPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationPubSubService.name)
  private readonly subscriber: Redis
  private readonly publisher: Redis
  private readonly subjects = new Map<string, Subject<NotificationRequestDto>>()

  constructor(private readonly configService: ConfigService) {
    const redisConfig = configService.get('redis')
    const options = {
      host: redisConfig?.host ?? 'localhost',
      port: redisConfig?.port ?? 6379,
      password: redisConfig?.password as string | undefined,
      db: redisConfig?.db ?? 0,
    }

    // Create a subscriber and publisher in each backend pod
    this.subscriber = new Redis(options)
    this.publisher = new Redis(options)

    // Subscribe to all notification:changed events
    this.subscriber.psubscribe('notification:changed:*', (err) => {
      if (err) this.logger.error('Failed to subscribe to notification changes', err)
      else this.logger.log('Subscribed to notification:changed:* channel')
    })

    // Push the update to the tenant's RxJS Subject, which the SSE stream subscribes to
    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const tenantId = channel.slice('notification:changed:'.length)
      const subject = this.subjects.get(tenantId)
      if (!subject) return
      try {
        subject.next(JSON.parse(message) as NotificationRequestDto)
      } catch (err) {
        this.logger.error(`Failed to parse notification update for tenant ${tenantId}`, err)
      }
    })
  }

  /**
   * Returns an observable that emits notification_request DTOs for the given tenant.
   * Creates a new Subject on first call for each tenantId.
   */
  getObservable(tenantId: string): Observable<NotificationRequestDto> {
    if (!this.subjects.has(tenantId)) {
      this.subjects.set(tenantId, new Subject<NotificationRequestDto>())
    }
    return this.subjects.get(tenantId)!.asObservable()
  }

  /**
   * Publishes a notification_request update for the given tenant.
   * All pods subscribed to this tenant's channel will receive the update.
   */
  async publish(tenantId: string, dto: NotificationRequestDto): Promise<void> {
    try {
      await this.publisher.publish(`notification:changed:${tenantId}`, JSON.stringify(dto))
    } catch (err) {
      this.logger.error(`Failed to publish notification update for tenant ${tenantId}`, err)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.punsubscribe()
    await this.subscriber.quit()
    await this.publisher.quit()
  }
}
