import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { QueueModule } from './queue.module'
import { ProviderToken } from '../enum/provider-token.enum'
import { QueueName } from '../enum/queue-name.enum'
import Bull from 'bull'
import Redis from 'ioredis'

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
})
