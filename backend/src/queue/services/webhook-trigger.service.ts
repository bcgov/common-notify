import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import Bull from 'bull'
import { WebhookService } from '../../api/webhook/webhook.service'
import { WebhookJobPayload } from '../queue.types'
import { QueueName } from '../../enum/queue-name.enum'
import { NotificationRequestDto } from '../../api/notification/schemas/notification-request'

/**
 * Webhook Trigger Service
 *
 * Listens to the same Redis pub/sub channel used by the SSE feature
 * (`notification:changed:{tenantId}`) and dispatches webhook delivery jobs
 * for any active webhook configurations that match the notification's
 * channel and status transition.
 *
 * Trigger mapping:
 *   trigger: ['success'] → fires when notification status is COMPLETED
 *   trigger: ['failure'] → fires when notification status is FAILED
 *   trigger: []          → fires for any status change
 *
 * Channel filter:
 *   channelType: ['email']  → only fires for EMAIL notifications
 *   channelType: []         → fires for any channel
 */
@Injectable()
export class WebhookTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookTriggerService.name)
  private subscriber?: Redis

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookService: WebhookService,
    @Optional()
    @Inject(QueueName.WEBHOOK_DELIVERY)
    private readonly webhookQueue?: Bull.Queue<WebhookJobPayload>,
  ) {}

  onModuleInit(): void {
    const redisConfig = this.configService.get('redis')
    if (!redisConfig || !this.webhookQueue) {
      this.logger.warn(
        'Redis or webhook queue not available — skipping WebhookTriggerService initialization',
      )
      return
    }

    this.subscriber = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password as string | undefined,
      db: redisConfig.db,
    })

    this.subscriber.psubscribe('notification:changed:*', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe to notification:changed:* for webhook triggers', err)
      } else {
        this.logger.log('WebhookTriggerService subscribed to notification:changed:* channel')
      }
    })

    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const tenantId = channel.slice('notification:changed:'.length)
      try {
        const notification = JSON.parse(message) as NotificationRequestDto
        // Fire-and-forget — errors are logged inside processNotificationChange
        this.processNotificationChange(tenantId, notification).catch((err) => {
          this.logger.error(
            `[${notification?.id}] Unhandled error in WebhookTriggerService: ${err?.message}`,
          )
        })
      } catch (err) {
        this.logger.error(
          `Failed to parse notification:changed message for tenant=${tenantId}`,
          err,
        )
      }
    })
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.punsubscribe()
      await this.subscriber.quit()
    }
  }

  private async processNotificationChange(
    tenantId: string,
    notification: NotificationRequestDto,
  ): Promise<void> {
    const activeWebhooks = await this.webhookService.findActiveByTenant(tenantId)
    if (activeWebhooks.length === 0) return

    const notificationStatus = notification.status?.code?.toLowerCase()
    const notificationChannels = (notification.channelCodes ?? []).map((c) => c.toLowerCase())

    for (const webhook of activeWebhooks) {
      const triggerTypes = webhook.triggerOn ?? []

      // Map spec trigger values to notification statuses:
      //   'success' → notification status 'completed'
      //   'failure' → notification status 'failed'
      // Empty triggerOn = fire for any status
      const statusMatches =
        triggerTypes.length === 0 ||
        triggerTypes.some((t) => {
          if (t === 'success') return notificationStatus === 'completed'
          if (t === 'failure') return notificationStatus === 'failed'
          return false
        })

      if (!statusMatches) continue

      // Empty channelType = fire for any channel; otherwise fire if the request targeted any of
      // the webhook's channels
      const channelTypes = webhook.channelType ?? []
      const channelMatches =
        channelTypes.length === 0 ||
        channelTypes.some((ct) => notificationChannels.includes(ct.toLowerCase()))

      if (!channelMatches) continue

      const jobPayload: WebhookJobPayload = {
        notificationId: notification.id,
        tenantId,
        webhookId: webhook.id,
        event: 'notification.status.changed',
        payload: {
          notifyId: notification.id,
          status: notification.status,
          channel: notification.channelCodes?.join(', '),
          createdAt: notification.createdAt,
          updatedAt: notification.updatedAt,
        },
      }

      try {
        // Job ID includes status to allow one delivery per webhook per status transition
        const jobId = `webhook_${webhook.id}_${notification.id}_${notificationStatus}`
        await this.webhookQueue!.add(jobPayload, {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        })
        this.logger.log(
          `[${notification.id}] Queued webhook delivery for webhook=${webhook.id} (status=${notificationStatus})`,
        )
      } catch (err) {
        this.logger.error(
          `[${notification.id}] Failed to queue webhook delivery for webhook=${webhook.id}: ${(err as Error)?.message}`,
        )
      }
    }
  }
}
