import { Module, OnModuleInit, Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Bull from 'bull'
import Redis from 'ioredis'
import { QueueName } from '../enum/queue-name.enum'
import { ProviderToken } from '../enum/provider-token.enum'
import { IngestionWorker } from './workers/ingestion.worker'

/**
 * Queue Module
 *
 * Initializes BullMQ queues with Redis connection.
 * Provides Redis client and queues as injectable providers for use in services and controllers.
 * Each queue is configured with the same Redis connection settings from ConfigService.
 * Queues: - Ingestion: For processing incoming notifications and orchestrating delivery
 *         - Email Delivery: For handling email sending jobs
 *         - SMS Delivery: For handling SMS sending jobs
 */
@Module({
  providers: [
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
    private readonly configService?: ConfigService,
  ) {}

  async onModuleInit() {
    // Skip queue initialization if queues are not available (e.g., in tests without Redis)
    if (!this.ingestionQueue || !this.emailQueue || !this.smsQueue) {
      this.logger.debug('Queue configuration not available - skipping worker initialization')
      return
    }

    this.logger.log('Initializing queue workers...')

    // Read concurrency configuration
    const concurrency = this.configService?.get<number>('queue.ingestionWorkerConcurrency') || 1
    this.logger.log(`Ingestion worker concurrency: ${concurrency}`)

    // Initialize workers in background - don't block app startup
    // Workers will be ready when first job is queued
    IngestionWorker.initialize(this.ingestionQueue, this.emailQueue, this.smsQueue, concurrency)
      .then(() => {
        this.logger.log('Queue workers initialized successfully')
      })
      .catch((error) => {
        this.logger.warn(`Queue worker initialization failed: ${error.message}`)
        this.logger.debug(error)
      })
  }
}
