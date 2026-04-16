import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Bull from 'bull'
import Redis from 'ioredis'
import { QueueName } from '../enum/queue-name.enum'
import { ProviderToken } from '../enum/provider-token.enum'

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
 * Future queues can be added here (e.g. MsgApp Delivery) following the same pattern.
 */
@Module({
  providers: [
    // Provides a direct Redis connection for advanced use cases
    // Inject with: @Inject(ProviderToken.REDIS_CLIENT) redisClient: Redis
    {
      provide: ProviderToken.REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')
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
    //
    // Injection pattern:
    // @Inject(QueueName.INGESTION) ingestionQueue: Bull.Queue
    // @Inject(QueueName.EMAIL_DELIVERY) emailQueue: Bull.Queue
    // @Inject(QueueName.SMS_DELIVERY) smsQueue: Bull.Queue
    {
      provide: QueueName.INGESTION,
      useFactory: (configService: ConfigService) => {
        // Note: BullMQ will handle Redis connection internally
        // We pass config options here
        const redisConfig = configService.get('redis')
        const redisClient = new Redis({
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
        })

        return new Bull(QueueName.INGESTION, {
          createClient: () => redisClient,
        })
      },
      inject: [ConfigService],
    },
    {
      provide: QueueName.EMAIL_DELIVERY,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')
        const redisClient = new Redis({
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
        })

        return new Bull(QueueName.EMAIL_DELIVERY, {
          createClient: () => redisClient,
        })
      },
      inject: [ConfigService],
    },
    {
      provide: QueueName.SMS_DELIVERY,
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis')
        const redisClient = new Redis({
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
        })

        return new Bull(QueueName.SMS_DELIVERY, {
          createClient: () => redisClient,
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
export class QueueModule {}
