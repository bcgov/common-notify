import { Module, OnModuleInit, Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import Bull from 'bull'
import Redis from 'ioredis'
import { QueueName } from '../enum/queue-name.enum'
import { ProviderToken } from '../enum/provider-token.enum'
import { IngestionWorker } from './workers/ingestion.worker'
import { EmailDeliveryWorker } from './workers/email-delivery.worker'
import { SmsDeliveryWorker } from './workers/sms-delivery.worker'
import { PendingNotificationRetryService } from './services/pending-notification-retry.service'
import { NotificationRequest } from '../api/notification/entities/notification-request.entity'
import { NotificationService } from '../api/notification/notification.service'
import { EMAIL_ADAPTER, IEmailTransport, SMS_ADAPTER, ISmsTransport } from '../adapters'
import { TenantsModule } from '../api/admin/tenants/tenants.module'

/**
 * Queue Module
 *
 * Initializes BullMQ queues with Redis connection.
 * Provides Redis client and queues as injectable providers for use in services and controllers.
 * Each queue is configured with the same Redis connection settings from ConfigService.
 * Queues: - Ingestion: For processing incoming notifications and orchestrating delivery
 *         - Email Delivery: For handling email sending jobs
 *         - SMS Delivery: For handling SMS sending jobs
 *
 * Also provides scheduled retry job for PENDING notifications that couldn't be queued
 * due to temporary Redis unavailability.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationRequest]), TenantsModule],
  providers: [
    PendingNotificationRetryService,
    NotificationService,
    // Provides a direct Redis connection for advanced use cases
    // Inject with: @Inject(ProviderToken.REDIS_CLIENT) redisClient: Redis
    {
      provide: ProviderToken.REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')
        if (!redisConfig) {
          return null
        }
        return new Redis({
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
        })
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
    {
      provide: QueueName.INGESTION,
      useFactory: (configService: ConfigService) => {
        // Bull manages its own Redis connections
        // Pass Redis config directly without pre-created clients
        const redisConfig = configService.get('redis')

        // If no redis config (e.g., in tests), return null to skip queue initialization
        if (!redisConfig) {
          return null
        }

        // Only include password if it's defined
        const redisOptions: any = {
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
        }
        if (redisConfig.password) {
          redisOptions.password = redisConfig.password
        }

        return new Bull(QueueName.INGESTION, {
          redis: redisOptions,
        })
      },
      inject: [ConfigService],
    },
    {
      provide: QueueName.EMAIL_DELIVERY,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')

        // If no redis config (e.g., in tests), return null to skip queue initialization
        if (!redisConfig) {
          return null
        }

        const redisOptions: any = {
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
        }
        if (redisConfig.password) {
          redisOptions.password = redisConfig.password
        }

        return new Bull(QueueName.EMAIL_DELIVERY, {
          redis: redisOptions,
        })
      },
      inject: [ConfigService],
    },
    {
      provide: QueueName.SMS_DELIVERY,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')

        // If no redis config (e.g., in tests), return null to skip queue initialization
        if (!redisConfig) {
          return null
        }

        const redisOptions: any = {
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
        }
        if (redisConfig.password) {
          redisOptions.password = redisConfig.password
        }

        return new Bull(QueueName.SMS_DELIVERY, {
          redis: redisOptions,
        })
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    ProviderToken.REDIS_CLIENT,
    QueueName.INGESTION,
    QueueName.EMAIL_DELIVERY,
    QueueName.SMS_DELIVERY,
  ],
})
export class QueueModule implements OnModuleInit {
  private readonly logger = new Logger(QueueModule.name)

  constructor(
    @Inject(QueueName.INGESTION) private ingestionQueue?: Bull.Queue,
    @Inject(QueueName.EMAIL_DELIVERY) private emailQueue?: Bull.Queue,
    @Inject(QueueName.SMS_DELIVERY) private smsQueue?: Bull.Queue,
    @InjectRepository(NotificationRequest)
    private readonly notificationRepository?: Repository<NotificationRequest>,
    private readonly configService?: ConfigService,
    private readonly notificationService?: NotificationService,
    @Inject(EMAIL_ADAPTER) private readonly emailAdapter?: IEmailTransport,
    @Inject(SMS_ADAPTER) private readonly smsAdapter?: ISmsTransport,
  ) {}

  async onModuleInit() {
    // Skip queue initialization if queues are not available (e.g., in tests without Redis)
    if (!this.ingestionQueue || !this.emailQueue || !this.smsQueue) {
      this.logger.debug('Queue configuration not available - skipping worker initialization')
      return
    }

    this.logger.log('Initializing queue workers...')
    this.logger.log(
      `Dependency check - notificationService available: ${!!this.notificationService}`,
    )

    // Read concurrency configuration
    const concurrency = this.configService?.get<number>('queue.ingestionWorkerConcurrency') || 1
    this.logger.log(`Ingestion worker concurrency: ${concurrency}`)

    // Initialize workers in background - don't block app startup
    // Workers will be ready when first job is queued
    try {
      this.logger.log('About to initialize ingestion worker...')
      // Initialize ingestion worker - orchestrates fan-out to delivery queues
      IngestionWorker.initialize(
        this.ingestionQueue,
        this.emailQueue,
        this.smsQueue,
        this.notificationService,
        this.configService,
        concurrency,
      )
      this.logger.log('Ingestion worker initialization started')

      this.logger.log('About to initialize email delivery worker...')
      // Initialize email delivery worker - handles email sending
      // IMPORTANT: Do NOT await these - initialize() does not await process()
      // and returns immediately after setting up listeners
      const emailConcurrency =
        this.configService?.get<number>('queue.emailDeliveryWorkerConcurrency') || 2
      EmailDeliveryWorker.initialize(
        this.emailQueue,
        this.notificationService,
        this.configService,
        this.emailAdapter,
        emailConcurrency,
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
        this.smsAdapter,
        smsConcurrency,
      )
      this.logger.log('SMS delivery worker initialization started')

      this.logger.log('Queue workers initialized successfully')
    } catch (error) {
      this.logger.error(
        `Queue worker initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      this.logger.debug(error)
    }
  }
}
