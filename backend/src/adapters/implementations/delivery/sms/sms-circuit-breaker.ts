import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Redis from 'ioredis'
import { RedisCircuitBreaker } from '../../../../common/redis/circuit-breaker'
import { createRedisClient, type RedisConfig } from '../../../../queue/redis-connection'
import { isTransientDeliveryError } from '../../../delivery-errors'
import { SMS_CIRCUIT_KEY } from '../../../delivery-keys'
import type { ISmsTransport } from '../../../interfaces'

/** How long startup waits for the breaker's Redis connection before sending without it. */
const CONNECT_WAIT_MS = 2000

/**
 * Stops every pod sending SMS while the provider is failing, whichever provider is configured.
 * Five transient failures in ten seconds open it; sends wait 30s, then one probe send decides.
 * See RedisCircuitBreaker. Without Redis (tests) sends go straight through.
 */
@Injectable()
export class SmsCircuitBreaker implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis | null = null
  private readonly breaker: RedisCircuitBreaker | null = null

  constructor(configService: ConfigService) {
    const redisConfig = configService.get<RedisConfig>('redis')
    if (!redisConfig) return
    this.redis = createRedisClient(redisConfig, SmsCircuitBreaker.name, {
      // On the send path: a Redis outage has to fall back to sending in milliseconds.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 250,
    })
    this.breaker = new RedisCircuitBreaker(this.redis, SMS_CIRCUIT_KEY, {
      failureThreshold: 5,
      windowMs: 10_000,
      cooldownMs: 30_000,
      // Provider SDKs retry internally before giving up; allow for that.
      probeTimeoutMs: 120_000,
      isFailure: isTransientDeliveryError,
    })
  }

  /** The transport, with every send passing the breaker. */
  wrap(transport: ISmsTransport): ISmsTransport {
    const breaker = this.breaker
    if (!breaker) return transport
    return { name: transport.name, send: (options) => breaker.run(() => transport.send(options)) }
  }

  /** With no offline queue a command sent mid-handshake is rejected; see ChesEmailTransport. */
  async onModuleInit(): Promise<void> {
    const redis = this.redis
    if (!redis || redis.status === 'ready') return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, CONNECT_WAIT_MS)
      redis.once('ready', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => this.redis?.disconnect())
  }
}
