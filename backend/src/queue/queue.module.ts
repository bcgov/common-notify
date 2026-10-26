import {
  BeforeApplicationShutdown,
  Module,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Logger,
  Optional,
  Provider,
  forwardRef,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { Job, Queue, Worker } from 'bullmq'
import type Redis from 'ioredis'
import { QueueName } from '../enum/queue-name.enum'
import { createQueue, createRedisClient, createWorker, type RedisConfig } from './redis-connection'
import { WorkerHeartbeat } from './worker-heartbeat'
import { ProviderToken } from '../enum/provider-token.enum'
import { IngestionWorker } from './workers/ingestion.worker'
import { EmailDeliveryWorker } from './workers/email-delivery.worker'
import { SmsDeliveryWorker } from './workers/sms-delivery.worker'
import { WebhookDeliveryWorker } from './workers/webhook-delivery.worker'
import { MergeBatchRunner } from './workers/merge-batch-runner'
import { DeliveryFailureHandler } from './workers/delivery-failure-handler'
import type { QueueProcessor } from './workers/queue-processor'
import { DeliveryReconcilerService } from './services/delivery-reconciler.service'
import { WebhookTriggerService } from './services/webhook-trigger.service'
import { NotificationRequest } from '../api/notification/entities/notification-request.entity'
import { NotificationRequestDetail } from '../api/notification/entities/notification-request-detail.entity'
import { NotificationService } from '../api/notification/notification.service'
import { NotificationRequestDetailService } from '../api/notification/notification-request-detail.service'
import { NotificationPubSubService } from '../api/notification/notification-pubsub.service'
import { TenantsModule } from '../api/admin/tenants/tenants.module'
import { TemplatesModule } from '../api/templates/templates.module'
import { TenantSettingsModule } from '../api/tenant-settings/tenant-settings.module'
import { FeatureFlagModule } from '../api/feature-flag/feature-flag.module'
import { EventsModule } from '../api/events/events.module'
import { NotifyModule } from '../api/notify/notify.module'
import { WebhookModule } from '../api/webhook/webhook.module'
import { ClamavModule } from '../services/clamav.module'
import { AttachmentModule } from '../api/attachment/attachment.module'
import { PhoneNumberService } from '../api/notify/services/phone-number.service'

/** A queue's provider; null when Redis is not configured (in tests), so nothing connects. */
function queueProvider(name: QueueName): Provider {
  return {
    provide: name,
    useFactory: (configService: ConfigService, redis: Redis | null) => {
      const redisConfig = configService.get<RedisConfig>('redis')
      return redisConfig ? createQueue(name, redisConfig, redis) : null
    },
    inject: [ConfigService, ProviderToken.REDIS_CLIENT],
  }
}

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
    FeatureFlagModule,
    WebhookModule,
    AttachmentModule,
    ClamavModule,
    forwardRef(() => NotifyModule),
    forwardRef(() => EventsModule),
  ],
  providers: [
    DeliveryReconcilerService,
    NotificationService,
    NotificationRequestDetailService,
    NotificationPubSubService,
    PhoneNumberService,
    MergeBatchRunner,
    DeliveryFailureHandler,
    IngestionWorker,
    EmailDeliveryWorker,
    SmsDeliveryWorker,
    WebhookDeliveryWorker,
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

    // One BullMQ Queue - the producer side - per queue, each with its own Redis connection.
    // Inject with: @Inject(QueueName.EMAIL_DELIVERY) emailQueue: Queue<DeliveryJobPayload>
    // Workers - the consumer side - are created in onModuleInit.
    ...Object.values(QueueName).map(queueProvider),
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
  /** This pod's workers, keyed by queue; created in onModuleInit. */
  private readonly workers = new Map<QueueName, Worker>()

  constructor(
    @Inject(QueueName.INGESTION) private readonly ingestionQueue?: Queue | null,
    @Inject(QueueName.EMAIL_DELIVERY) private readonly emailQueue?: Queue | null,
    @Inject(QueueName.SMS_DELIVERY) private readonly smsQueue?: Queue | null,
    @Inject(QueueName.WEBHOOK_DELIVERY) private readonly webhookQueue?: Queue | null,
    private readonly configService?: ConfigService,
    private readonly ingestionWorker?: IngestionWorker,
    private readonly emailDeliveryWorker?: EmailDeliveryWorker,
    private readonly smsDeliveryWorker?: SmsDeliveryWorker,
    private readonly webhookDeliveryWorker?: WebhookDeliveryWorker,
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
   * Let in-flight jobs finish before the pod exits. Without this a deploy or an HPA scale-down
   * kills a merge batch part-way through and BullMQ re-runs it on another pod once its lock
   * lapses.
   *
   * Every worker stops taking new work on this pod first; then ingestion drains ahead of the
   * delivery queues it feeds, and delivery ahead of the webhooks it triggers. The queues' own
   * connections close last. Runs before onApplicationShutdown, where TypeORM closes its
   * connection, so a finishing job can still record what it sent. The wait is capped below the
   * pod's termination grace period (QUEUE_SHUTDOWN_DRAIN_MS, set by the chart); a batch still
   * running then is re-run elsewhere, and the delivery workers skip recipients already sent.
   */
  async beforeApplicationShutdown(): Promise<void> {
    const stages = [
      [QueueName.INGESTION],
      [QueueName.EMAIL_DELIVERY, QueueName.SMS_DELIVERY],
      [QueueName.WEBHOOK_DELIVERY],
    ].map((stage) =>
      stage.map((name) => this.workers.get(name)).filter((worker): worker is Worker => !!worker),
    )
    const workers = stages.flat()
    const queues = [this.ingestionQueue, this.emailQueue, this.smsQueue, this.webhookQueue].filter(
      (queue): queue is Queue => !!queue,
    )
    if (workers.length === 0 && queues.length === 0) return

    const drainMs = Number.parseInt(process.env.QUEUE_SHUTDOWN_DRAIN_MS || '100000', 10)
    this.logger.log(`Draining queue workers (up to ${drainMs / 1000}s)`)

    const drain = async (): Promise<void> => {
      // Local pause without waiting: stops fetching new jobs on this pod only.
      await Promise.all(workers.map((worker) => worker.pause(true)))
      // A stage closes once its active jobs finish.
      for (const stage of stages) {
        await Promise.all(stage.map((worker) => worker.close()))
      }
      await Promise.all(queues.map((queue) => queue.close()))
    }

    let timer: NodeJS.Timeout | undefined
    const drained = await Promise.race([
      drain().then(() => true),
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
      this.logger.warn(
        `Queue drain did not finish within ${drainMs}ms; unfinished jobs will be re-run by another pod`,
      )
    }
  }

  onModuleInit(): void {
    const redisConfig = this.configService?.get<RedisConfig>('redis')
    // Skip queue initialization if queues are not available (e.g., in tests without Redis)
    if (!redisConfig || !this.ingestionQueue || !this.emailQueue || !this.smsQueue) {
      this.logger.debug('Queue configuration not available - skipping worker initialization')
      return
    }

    // Published per pod so the admin monitoring page can list every pod's workers.
    this.heartbeat = this.redisClient ? new WorkerHeartbeat(this.redisClient) : undefined

    const workers: Array<[Queue | null | undefined, QueueProcessor<never> | undefined]> = [
      [this.ingestionQueue, this.ingestionWorker],
      [this.emailQueue, this.emailDeliveryWorker],
      [this.smsQueue, this.smsDeliveryWorker],
      [this.webhookQueue, this.webhookDeliveryWorker],
    ]
    try {
      for (const [queue, worker] of workers) {
        if (queue && worker) this.startWorker(worker, redisConfig)
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

  /** Run a worker against its queue at its configured concurrency. */
  private startWorker<T>(processor: QueueProcessor<T>, redisConfig: RedisConfig): void {
    const concurrency =
      this.configService?.get<number>(`queue.${processor.concurrency.configKey}`) ||
      processor.concurrency.default
    this.logger.log(`Registering ${processor.queueName} worker (concurrency=${concurrency})`)

    const worker = createWorker<T>(
      processor.queueName,
      (job) => processor.process(job),
      redisConfig,
      concurrency,
    )
    const { onCompleted, onFailed } = processor
    if (onCompleted) {
      worker.on('completed', (job: Job<T>) => onCompleted.call(processor, job))
    }
    if (onFailed) {
      // BullMQ types the job as optional here; a job that stalls out never reaches this event.
      worker.on('failed', (job: Job<T> | undefined, error: Error) => {
        if (!job) return
        // An event listener's rejection reaches nothing but Node's unhandled-rejection handler.
        Promise.resolve()
          .then(() => onFailed.call(processor, job, error))
          .catch((handlerError: Error) => {
            this.logger.error(
              `[${processor.queueName}] Failed-job handler threw for job ${job.id}: ${handlerError.message}`,
            )
          })
      })
    }
    this.heartbeat?.track(worker as Worker, concurrency)
    this.workers.set(processor.queueName, worker as Worker)
  }
}
