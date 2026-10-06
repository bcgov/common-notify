import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { QueueModule } from './queue.module'
import { ProviderToken } from '../enum/provider-token.enum'
import { QueueName } from '../enum/queue-name.enum'
import Bull from 'bull'
import Redis from 'ioredis'
import { Logger } from '@nestjs/common'
import { vi } from 'vitest'

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
      expect(ingestionQueue).toBeInstanceOf(Bull)
    })

    it('should provide email delivery queue', () => {
      const emailQueue = module.get(QueueName.EMAIL_DELIVERY)
      expect(emailQueue).toBeDefined()
      expect(emailQueue).toBeInstanceOf(Bull)
    })

    it('should provide SMS delivery queue', () => {
      const smsQueue = module.get(QueueName.SMS_DELIVERY)
      expect(smsQueue).toBeDefined()
      expect(smsQueue).toBeInstanceOf(Bull)
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

    function mockQueue(name: string, close?: () => Promise<void>): Bull.Queue {
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
      } as unknown as Bull.Queue
    }

    beforeEach(() => {
      calls.length = 0
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      delete process.env.QUEUE_SHUTDOWN_TIMEOUT_MS
      vi.restoreAllMocks()
    })

    it('stops every queue taking work, then drains ingestion before delivery before webhooks', async () => {
      const queues = ['ingestion', 'email', 'sms', 'webhook'].map((name) => mockQueue(name))
      const module = new QueueModule(queues[0], queues[1], queues[2], queues[3])

      await module.beforeApplicationShutdown()

      for (const queue of queues) {
        expect(queue.pause).toHaveBeenCalledWith(true, true)
      }
      expect(calls.slice(0, 4).every((call) => call.startsWith('pause:'))).toBe(true)
      expect(calls.slice(4)).toEqual([
        'close:ingestion',
        'close:email',
        'close:sms',
        'close:webhook',
      ])
    })

    it('gives up at the deadline rather than holding the pod past its grace period', async () => {
      process.env.QUEUE_SHUTDOWN_TIMEOUT_MS = '20'
      const stuck = mockQueue('ingestion', () => new Promise<void>(() => {}))
      const module = new QueueModule(stuck, mockQueue('email'), mockQueue('sms'), undefined)

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
})
