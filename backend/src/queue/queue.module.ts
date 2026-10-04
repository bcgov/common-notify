import {
  BeforeApplicationShutdown,
  Module,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Logger,
  Optional,
  forwardRef,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type Bull from 'bull'
import type Redis from 'ioredis'
import { QueueName } from '../enum/queue-name.enum'
import { createQueue, createRedisClient } from './redis-connection'
import { WorkerHeartbeat } from './worker-heartbeat'
import { ProviderToken } from '../enum/provider-token.enum'
import { IngestionWorker } from './workers/ingestion.worker'
import { EmailDeliveryWorker } from './workers/email-delivery.worker'
import { SmsDeliveryWorker } from './workers/sms-delivery.worker'
import { WebhookDeliveryWorker } from './workers/webhook-delivery.worker'
import { PendingNotificationRetryService } from './services/pending-notification-retry.service'
import { WebhookTriggerService } from './services/webhook-trigger.service'
import { NotificationRequest } from '../api/notification/entities/notification-request.entity'
import { NotificationRequestDetail } from '../api/notification/entities/notification-request-detail.entity'
import { NotificationService } from '../api/notification/notification.service'
import { NotificationRequestDetailService } from '../api/notification/notification-request-detail.service'
import { NotificationPubSubService } from '../api/notification/notification-pubsub.service'
import { TemplatesRepository } from '../api/templates/templates.repository'
import { TenantSettingsService } from '../api/tenant-settings/tenant-settings.service'
import { TemplatesService } from '../api/templates/templates.service'
import { InlineRenderingService } from '../services/rendering/inline-rendering.service'
import { EMAIL_ADAPTER, IEmailTransport, SMS_ADAPTER, ISmsTransport } from '../adapters'
import { TenantsModule } from '../api/admin/tenants/tenants.module'
import { TemplatesModule } from '../api/templates/templates.module'
import { TenantSettingsModule } from '../api/tenant-settings/tenant-settings.module'
import { NotifyModule } from '../api/notify/notify.module'
import { WebhookModule } from '../api/webhook/webhook.module'
import { WebhookService } from '../api/webhook/webhook.service'
import { WebhookDeliveryLogRepository } from '../api/webhook/webhook-delivery-log.repository'
import { AttachmentResolverService } from '../api/notify/services/attachment-resolver.service'
import { ClamavService } from '../services/clamav.service'
import { ClamavModule } from '../services/clamav.module'
import { AttachmentModule } from '../api/attachment/attachment.module'
import { AttachmentService } from '../api/attachment/attachment.service'
import { StructuredLoggerService } from '../common/logger'
import { PhoneNumberService } from '../api/notify/services/phone-number.service'

/**
 * Queue Module
 *
 * Initializes BullMQ queues with Redis connection.
 * Provides Redis client and queues as injectable providers for use in services and controllers.
 * Each queue is configured with the same Redis connection settings from ConfigService.
 * Queues: - Ingestion: For processing incoming notifications and orchestrating delivery
 *         - Email Delivery: For handling email sending jobs
 *         - SMS Delivery: For handling SMS sending jobs
 *         - Webhook Delivery: For dispatching HTTP POST callbacks to registered tenant URLs
 *
 * Also provides scheduled retry job for PENDING notifications that couldn't be queued
 * due to temporary Redis unavailability.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationRequest, NotificationRequestDetail]),
    TenantsModule,
    TemplatesModule,
    TenantSettingsModule,
    WebhookModule,
    AttachmentModule,
    ClamavModule,
    forwardRef(() => NotifyModule),
  ],
  providers: [
    PendingNotificationRetryService,
    NotificationService,
    NotificationRequestDetailService,
    NotificationPubSubService,
    PhoneNumberService,
    // Provides a direct Redis connection for advanced use cases
    // Inject with: @Inject(ProviderToken.REDIS_CLIENT) redisClient: Redis
    {
      provide: ProviderToken.REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')
        if (!redisConfig) {
          return null
        }
        return createRedisClient(redisConfig, 'RedisClient')
      },
      inject: [ConfigService],
    },

    // Each queue is a separate provider with its own Redis connection.
    // BullMQ automatically handles job persistence, retries, and scheduling.
    // Bull creates its own Redis connections to avoid conflicts with enableReadyCheck.
    //
    // Injection pattern:
    // @Inject(QueueName.INGESTION) ingestionQueue: Bull.Queue
    // @Inject(QueueName.EMAIL_DELIVERY) emailQueue: Bull.Queue
    // @Inject(QueueName.SMS_DELIVERY) smsQueue: Bull.Queue
    // @Inject(QueueName.WEBHOOK_DELIVERY) webhookQueue: Bull.Queue
    {
      provide: QueueName.INGESTION,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')

        // No redis config (e.g. in tests): skip queue initialization
        if (!redisConfig) {
          return null
        }

        return createQueue(QueueName.INGESTION, redisConfig)
      },
      inject: [ConfigService],
    },
    {
      provide: QueueName.EMAIL_DELIVERY,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')

        // No redis config (e.g. in tests): skip queue initialization
        if (!redisConfig) {
          return null
        }

        return createQueue(QueueName.EMAIL_DELIVERY, redisConfig)
      },
      inject: [ConfigService],
    },
    {
      provide: QueueName.SMS_DELIVERY,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')

        // No redis config (e.g. in tests): skip queue initialization
        if (!redisConfig) {
          return null
        }

        return createQueue(QueueName.SMS_DELIVERY, redisConfig)
      },
      inject: [ConfigService],
    },
    {
      provide: QueueName.WEBHOOK_DELIVERY,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')

        // No redis config (e.g. in tests): skip queue initialization
        if (!redisConfig) {
          return null
        }

        return createQueue(QueueName.WEBHOOK_DELIVERY, redisConfig)
      },
      inject: [ConfigService],
    },
    WebhookTriggerService,
  ],
  exports: [
    ProviderToken.REDIS_CLIENT,
    QueueName.INGESTION,
    QueueName.EMAIL_DELIVERY,
    QueueName.SMS_DELIVERY,
    QueueName.WEBHOOK_DELIVERY,
  ],
})
export class QueueModule implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly logger = new Logger(QueueModule.name)
  private heartbeat?: WorkerHeartbeat

  constructor(
    @Inject(QueueName.INGESTION) private ingestionQueue?: Bull.Queue,
    @Inject(QueueName.EMAIL_DELIVERY) private emailQueue?: Bull.Queue,
    @Inject(QueueName.SMS_DELIVERY) private smsQueue?: Bull.Queue,
    @Inject(QueueName.WEBHOOK_DELIVERY) private webhookQueue?: Bull.Queue,
    @InjectRepository(NotificationRequest)
    private readonly notificationRepository?: Repository<NotificationRequest>,
    private readonly configService?: ConfigService,
    private readonly notificationService?: NotificationService,
    private readonly templatesRepository?: TemplatesRepository,
    private readonly templatesService?: TemplatesService,
    private readonly inlineRenderingService?: InlineRenderingService,
    private readonly attachmentResolverService?: AttachmentResolverService,
    private readonly attachmentService?: AttachmentService,
    @Inject(EMAIL_ADAPTER) private readonly emailAdapter?: IEmailTransport,
    @Inject(SMS_ADAPTER) private readonly smsAdapter?: ISmsTransport,
    private readonly notificationRequestDetailService?: NotificationRequestDetailService,
    private readonly tenantSettingsService?: TenantSettingsService,
    private readonly clamavService?: ClamavService,
    private readonly phoneNumberService?: PhoneNumberService,
    private readonly webhookService?: WebhookService,
    private readonly webhookDeliveryLogRepository?: WebhookDeliveryLogRepository,
    @Optional() private readonly structuredLogger?: StructuredLoggerService,
    @Optional()
    @Inject(ProviderToken.REDIS_CLIENT)
    private readonly redisClient?: Redis | null,
  ) {}

  onModuleDestroy(): void {
    // Not stopped yet: the workers keep running until beforeApplicationShutdown drains them,
    // and the page should show their jobs as held by a pod shutting down, not as stalled.
    this.heartbeat?.markDraining()
  }

  /**
   * Let in-flight jobs finish before the pod exits. Without this a deploy kills a merge batch
   * part-way through and Bull retries it on another pod about a minute later.
   *
   * Runs before onApplicationShutdown, where TypeORM closes its connection, so a finishing job
   * can still record what it sent. Bull's close() stops taking new jobs and resolves once the
   * active ones end. The wait is capped below the pod's termination grace period; a batch still
   * running then is left for Bull to retry, and the merge workers skip recipients already sent.
   */
  async beforeApplicationShutdown(): Promise<void> {
    const queues = [this.ingestionQueue, this.emailQueue, this.smsQueue, this.webhookQueue].filter(
      (queue): queue is Bull.Queue => !!queue,
    )
    if (queues.length === 0) return

    const drainMs = parseInt(process.env.QUEUE_SHUTDOWN_DRAIN_MS || '100000', 10)
    this.logger.log(`Draining queue workers (up to ${drainMs / 1000}s)`)
    let timer: NodeJS.Timeout | undefined
    const drained = await Promise.race([
      Promise.all(queues.map((queue) => queue.close())).then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), drainMs)
      }),
    ]).catch((error: Error) => {
      this.logger.error(`Queue drain failed: ${error.message}`)
      return false
    })
    if (timer) clearTimeout(timer)

    if (drained) {
      this.logger.log('Queue workers drained')
      await this.heartbeat?.remove()
    } else {
      // Still holding jobs: keep the heartbeat until the pod is killed so they read as held.
      this.logger.warn('Queue drain timed out; unfinished jobs will be retried on another pod')
    }
  }

  async onModuleInit() {
    // Skip queue initialization if queues are not available (e.g., in tests without Redis)
    if (!this.ingestionQueue || !this.emailQueue || !this.smsQueue) {
      this.logger.debug('Queue configuration not available - skipping worker initialization')
      return
    }

    this.logger.debug('Initializing queue workers...')
    this.logger.debug(
      `Dependency check - notificationService available: ${!!this.notificationService}`,
    )

    // Read concurrency configuration
    const concurrency = this.configService?.get<number>('queue.ingestionWorkerConcurrency') || 1
    this.logger.debug(`Ingestion worker concurrency: ${concurrency}`)

    // Published per pod so the admin monitoring page can list every pod's workers.
    this.heartbeat = this.redisClient ? new WorkerHeartbeat(this.redisClient) : undefined

    // Initialize workers in background - don't block app startup
    // Workers will be ready when first job is queued
    try {
      this.logger.debug('About to initialize ingestion worker...')
      // Initialize ingestion worker - orchestrates fan-out to delivery queues
      IngestionWorker.initialize(
        this.ingestionQueue,
        this.emailQueue,
        this.smsQueue,
        this.notificationService,
        this.notificationRequestDetailService,
        this.configService,
        this.clamavService,
        concurrency,
        this.attachmentService,
        this.phoneNumberService,
      )
      this.heartbeat?.track(this.ingestionQueue, concurrency)
      this.logger.debug('Ingestion worker initialization started')

      this.logger.debug('About to initialize email delivery worker...')
      // Initialize email delivery worker - handles email sending
      // IMPORTANT: Do NOT await these - initialize() does not await process()
      // and returns immediately after setting up listeners
      const emailConcurrency =
        this.configService?.get<number>('queue.emailDeliveryWorkerConcurrency') || 2
      EmailDeliveryWorker.initialize(
        this.emailQueue,
        this.notificationService,
        this.configService,
        this.templatesRepository,
        this.templatesService,
        this.inlineRenderingService,
        this.attachmentResolverService,
        this.emailAdapter,
        this.notificationRequestDetailService,
        emailConcurrency,
        this.structuredLogger,
        this.tenantSettingsService,
      )
      this.heartbeat?.track(this.emailQueue, emailConcurrency)
      this.logger.log('Email delivery worker initialization started')

      this.logger.log('About to initialize SMS delivery worker...')
      // Initialize SMS delivery worker - handles SMS sending
      // IMPORTANT: Do NOT await these - initialize() does not await process()
      // and returns immediately after setting up listeners
      const smsConcurrency =
        this.configService?.get<number>('queue.smsDeliveryWorkerConcurrency') || 2
      SmsDeliveryWorker.initialize(
        this.smsQueue,
        this.notificationService,
        this.configService,
        this.templatesRepository,
        this.templatesService,
        this.inlineRenderingService,
        this.smsAdapter,
        this.notificationRequestDetailService,
        smsConcurrency,
        this.structuredLogger,
      )
      this.heartbeat?.track(this.smsQueue, smsConcurrency)
      this.logger.log('SMS delivery worker initialization started')

      // Initialize webhook delivery worker — handles HTTP POST callbacks
      if (this.webhookQueue && this.webhookService && this.webhookDeliveryLogRepository) {
        const webhookConcurrency =
          this.configService?.get<number>('queue.webhookDeliveryWorkerConcurrency') || 2
        WebhookDeliveryWorker.initialize(
          this.webhookQueue,
          this.webhookService,
          this.webhookDeliveryLogRepository,
          webhookConcurrency,
        )
        this.heartbeat?.track(this.webhookQueue, webhookConcurrency)
        this.logger.log('Webhook delivery worker initialization started')
      }

      this.heartbeat?.start()

      this.logger.log('Queue workers initialized successfully')
    } catch (error) {
      this.logger.error(
        `Queue worker initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      this.logger.debug(error)
    }
  }
}
