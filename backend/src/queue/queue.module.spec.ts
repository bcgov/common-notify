import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { QueueModule } from './queue.module'
import { ProviderToken } from '../enum/provider-token.enum'
import { QueueName } from '../enum/queue-name.enum'
import { Queue, type Job } from 'bullmq'
import Redis from 'ioredis'
import { Logger } from '@nestjs/common'
import { vi, type Mock } from 'vitest'
import { createWorker } from './redis-connection'

vi.mock('./redis-connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./redis-connection')>()),
  createWorker: vi.fn(),
}))

describe('QueueModule', () => {
  describe.skip('Infrastructure Tests (requires Redis and Database)', () => {
    let module: TestingModule

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                redis: {
                  host: 'localhost',
                  port: 6379,
                  password: undefined,
                  db: 0,
                },
              }),
            ],
          }),
          QueueModule,
        ],
      }).compile()
    })

    afterEach(async () => {
      await module.close()
    })

    it('should be defined', () => {
      expect(module).toBeDefined()
    })

    it('should provide Redis client', () => {
      const redisClient = module.get(ProviderToken.REDIS_CLIENT)
      expect(redisClient).toBeDefined()
      expect(redisClient).toBeInstanceOf(Redis)
    })

    it('should provide ingestion queue', () => {
      const ingestionQueue = module.get(QueueName.INGESTION)
      expect(ingestionQueue).toBeDefined()
      expect(ingestionQueue).toBeInstanceOf(Queue)
    })

    it('should provide email delivery queue', () => {
      const emailQueue = module.get(QueueName.EMAIL_DELIVERY)
      expect(emailQueue).toBeDefined()
      expect(emailQueue).toBeInstanceOf(Queue)
    })

    it('should provide SMS delivery queue', () => {
      const smsQueue = module.get(QueueName.SMS_DELIVERY)
      expect(smsQueue).toBeDefined()
      expect(smsQueue).toBeInstanceOf(Queue)
    })

    it('should export all providers', async () => {
      const redisClient = module.get(ProviderToken.REDIS_CLIENT)
      const ingestionQueue = module.get(QueueName.INGESTION)
      const emailQueue = module.get(QueueName.EMAIL_DELIVERY)
      const smsQueue = module.get(QueueName.SMS_DELIVERY)

      expect(redisClient).toBeDefined()
      expect(ingestionQueue).toBeDefined()
      expect(emailQueue).toBeDefined()
      expect(smsQueue).toBeDefined()
    })

    it('should use Redis config from ConfigService', async () => {
      const configService = module.get(ConfigService)
      const redisConfig = configService.get('redis')

      expect(redisConfig).toBeDefined()
      expect(redisConfig.host).toBe('localhost')
      expect(redisConfig.port).toBe(6379)
    })
  })
  describe('beforeApplicationShutdown', () => {
    const calls: string[] = []

    function mockCloser(name: string, close?: () => Promise<void>) {
      return {
        pause: vi.fn(async () => {
          calls.push(`pause:${name}`)
        }),
        close: vi.fn(
          close ??
            (async () => {
              calls.push(`close:${name}`)
            }),
        ),
      }
    }

    /** A module whose onModuleInit has started these workers. */
    function moduleWith(workers: Partial<Record<QueueName, unknown>>, queues: unknown[] = []) {
      const module = new QueueModule(...(queues as [Queue, Queue, Queue, Queue]))
      const started = (module as unknown as { workers: Map<QueueName, unknown> }).workers
      for (const [name, worker] of Object.entries(workers)) started.set(name as QueueName, worker)
      return module
    }

    beforeEach(() => {
      calls.length = 0
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      delete process.env.QUEUE_SHUTDOWN_DRAIN_MS
      vi.restoreAllMocks()
    })

    it('stops every worker taking work, then drains ingestion before delivery before webhooks', async () => {
      const workers = {
        [QueueName.INGESTION]: mockCloser('ingestion'),
        [QueueName.EMAIL_DELIVERY]: mockCloser('email'),
        [QueueName.SMS_DELIVERY]: mockCloser('sms'),
        [QueueName.WEBHOOK_DELIVERY]: mockCloser('webhook'),
      }
      const queue = mockCloser('queue')
      const module = moduleWith(workers, [queue, queue, queue, queue])

      await module.beforeApplicationShutdown()

      for (const worker of Object.values(workers)) {
        // Local pause, not waiting for active jobs: those are waited for by close().
        expect(worker.pause).toHaveBeenCalledWith(true)
      }
      expect(calls.slice(0, 4).every((call) => call.startsWith('pause:'))).toBe(true)
      expect(calls.slice(4)).toEqual([
        'close:ingestion',
        'close:email',
        'close:sms',
        'close:webhook',
        'close:queue',
        'close:queue',
        'close:queue',
        'close:queue',
      ])
    })

    it('gives up at the deadline rather than holding the pod past its grace period', async () => {
      process.env.QUEUE_SHUTDOWN_DRAIN_MS = '20'
      const module = moduleWith({
        [QueueName.INGESTION]: mockCloser('ingestion', () => new Promise<void>(() => {})),
        [QueueName.EMAIL_DELIVERY]: mockCloser('email'),
      })

      await module.beforeApplicationShutdown()

      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('did not finish within 20ms'),
      )
      expect(calls).not.toContain('close:email')
    })

    it('does nothing when queues are not configured', async () => {
      const module = new QueueModule(undefined, undefined, undefined, undefined)

      await expect(module.beforeApplicationShutdown()).resolves.toBeUndefined()
    })
  })

  describe('onModuleInit', () => {
    const redis = { host: 'localhost', port: 6379, db: 0 }

    function mockQueue(name: string) {
      return { name } as unknown as Queue
    }

    function mockProcessor(queueName: QueueName, configKey: string, defaultConcurrency: number) {
      return {
        queueName,
        concurrency: { configKey, default: defaultConcurrency },
        process: vi.fn().mockResolvedValue('done'),
        onCompleted: vi.fn(),
        onFailed: vi.fn(),
      }
    }

    beforeEach(() => {
      vi.mocked(createWorker).mockReset()
      vi.mocked(createWorker).mockImplementation(
        (name) => ({ name, on: vi.fn(), pause: vi.fn(), close: vi.fn() }) as never,
      )
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
    })

    afterEach(() => vi.restoreAllMocks())

    function config(values: Record<string, unknown>) {
      return { get: vi.fn((key: string) => values[key]) } as unknown as ConfigService
    }

    it('runs each worker on its queue at the configured concurrency, or its default', async () => {
      const queues = Object.values(QueueName).map(mockQueue)
      const processors = [
        mockProcessor(QueueName.INGESTION, 'ingestionWorkerConcurrency', 1),
        mockProcessor(QueueName.EMAIL_DELIVERY, 'emailDeliveryWorkerConcurrency', 2),
        mockProcessor(QueueName.SMS_DELIVERY, 'smsDeliveryWorkerConcurrency', 2),
        mockProcessor(QueueName.WEBHOOK_DELIVERY, 'webhookDeliveryWorkerConcurrency', 2),
      ]
      const module = new QueueModule(
        queues[0],
        queues[1],
        queues[2],
        queues[3],
        config({ redis, 'queue.emailDeliveryWorkerConcurrency': 20 }),
        ...(processors as never[]),
      )

      module.onModuleInit()

      const created = vi.mocked(createWorker).mock.calls
      expect(created.map(([name, , , concurrency]) => [name, concurrency])).toEqual([
        [QueueName.INGESTION, 1],
        [QueueName.EMAIL_DELIVERY, 20],
        [QueueName.SMS_DELIVERY, 2],
        [QueueName.WEBHOOK_DELIVERY, 2],
      ])

      // The worker runs the processor's own handler, and so are the lifecycle listeners.
      const job = { id: 'job-1' } as Job
      await expect(created[1][1](job)).resolves.toBe('done')
      expect(processors[1].process).toHaveBeenCalledWith(job)

      const worker = vi.mocked(createWorker).mock.results[1].value as { on: Mock }
      const listeners = Object.fromEntries(worker.on.mock.calls) as Record<
        string,
        (...args: unknown[]) => void
      >
      listeners.completed(job)
      listeners.failed(job, new Error('boom'))
      // A stalled job removed on failure arrives without its job; there is nothing to settle.
      listeners.failed(undefined, new Error('stalled'))
      expect(processors[1].onCompleted).toHaveBeenCalledWith(job)
      await vi.waitFor(() => expect(processors[1].onFailed).toHaveBeenCalledTimes(1))
      expect(processors[1].onFailed).toHaveBeenCalledWith(
        job,
        expect.objectContaining({ message: 'boom' }),
      )
    })

    it('logs a failed-job handler that rejects instead of leaving the rejection unhandled', async () => {
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
      const processor = mockProcessor(QueueName.EMAIL_DELIVERY, 'emailDeliveryWorkerConcurrency', 2)
      processor.onFailed.mockRejectedValue(new Error('database down'))
      const queues = Object.values(QueueName).map(mockQueue)
      const module = new QueueModule(
        queues[0],
        queues[1],
        queues[2],
        queues[3],
        config({ redis }),
        undefined,
        processor as never,
      )

      module.onModuleInit()
      const worker = vi.mocked(createWorker).mock.results[0].value as { on: Mock }
      const failed = worker.on.mock.calls.find(([event]) => event === 'failed')![1]
      failed({ id: 'job-9' }, new Error('send failed'))

      await vi.waitFor(() =>
        expect(error).toHaveBeenCalledWith(expect.stringContaining('job job-9: database down')),
      )
    })

    it('starts no worker when Redis is not configured', () => {
      const processor = mockProcessor(QueueName.INGESTION, 'ingestionWorkerConcurrency', 1)
      const module = new QueueModule(
        undefined,
        undefined,
        undefined,
        undefined,
        config({}),
        processor as never,
      )

      module.onModuleInit()

      expect(createWorker).not.toHaveBeenCalled()
    })
  })
})
