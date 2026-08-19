import { Module, OnModuleInit, Inject, Logger, Optional, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type Bull from 'bull'
import { QueueName } from '../enum/queue-name.enum'
import { createQueue, createRedisClient } from './redis-connection'
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
import { TemplatesService } from '../api/templates/templates.service'
import { InlineRenderingService } from '../services/rendering/inline-rendering.service'
import { EMAIL_ADAPTER, IEmailTransport, SMS_ADAPTER, ISmsTransport } from '../adapters'
import { TenantsModule } from '../api/admin/tenants/tenants.module'
import { TemplatesModule } from '../api/templates/templates.module'
import { NotifyModule } from '../api/notify/notify.module'
import { WebhookModule } from '../api/webhook/webhook.module'
import { WebhookService } from '../api/webhook/webhook.service'
import { WebhookDeliveryLogRepository } from '../api/webhook/webhook-delivery-log.repository'
import { AttachmentResolverService } from '../api/notify/services/attachment-resolver.service'
import { ClamavService } from '../services/clamav.service'
import { AttachmentModule } from '../api/attachment/attachment.module'
import { AttachmentService } from '../api/attachment/attachment.service'
import { StructuredLoggerService } from '../common/logger'

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
    WebhookModule,
    AttachmentModule,
    forwardRef(() => NotifyModule),
  ],
  providers: [
    PendingNotificationRetryService,
    NotificationService,
    NotificationRequestDetailService,
    NotificationPubSubService,
    ClamavService,
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
export class QueueModule implements OnModuleInit {
  private readonly logger = new Logger(QueueModule.name)

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
    private readonly clamavService?: ClamavService,
    private readonly webhookService?: WebhookService,
    private readonly webhookDeliveryLogRepository?: WebhookDeliveryLogRepository,
    @Optional() private readonly structuredLogger?: StructuredLoggerService,
  ) {}

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
      )
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
      )
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
        this.logger.log('Webhook delivery worker initialization started')
      }

      this.logger.log('Queue workers initialized successfully')
    } catch (error) {
      this.logger.error(
        `Queue worker initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      this.logger.debug(error)
    }
  }
}
