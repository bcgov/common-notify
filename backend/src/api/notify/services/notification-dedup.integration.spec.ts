import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import Redis from 'ioredis'
import { NotificationDedupService } from './notification-dedup.service'
import { redisKey } from '../../../common/redis/redis-namespace'
import type { NotificationService } from '../../notification/notification.service'

/**
 * Against a real Redis, because the property that matters - one winner when several pods claim
 * the same fingerprint at once - comes from the Lua scripts running atomically, which a mocked
 * client cannot show. Skipped when no Redis is reachable on localhost:6379.
 */
describe('NotificationDedupService against Redis', () => {
  const tenantId = `dedup-it-${randomUUID()}`
  const redisConfig = { host: 'localhost', port: 6379, db: 0 }
  let admin: Redis
  let redisAvailable = false
  const pods: NotificationDedupService[] = []

  // No rows exist, so every holder reads as still being written.
  const notificationService = {
    findOne: async () => {
      throw new NotFoundException()
    },
  } as unknown as NotificationService

  const pod = async () => {
    const config = {
      get: (key: string) => (key === 'dedup.windowSeconds' ? 60 : redisConfig),
    } as unknown as ConfigService
    const service = new NotificationDedupService(config, notificationService)
    pods.push(service)
    await service.onModuleInit()
    return service
  }

  beforeAll(async () => {
    admin = new Redis({ ...redisConfig, lazyConnect: true, maxRetriesPerRequest: 0 })
    admin.on('error', () => {})
    try {
      await admin.connect()
      redisAvailable = (await admin.ping()) === 'PONG'
    } catch {
      console.warn('Redis not available for dedup integration tests; skipping')
    }
  })

  afterAll(async () => {
    if (redisAvailable) {
      const keys = await admin.keys(redisKey(`dedup:${tenantId}:*`))
      if (keys.length > 0) await admin.del(...keys)
    }
    await Promise.all(pods.map((service) => service.onModuleDestroy()))
    admin.disconnect()
  })

  it('lets exactly one of several concurrent pods claim a fingerprint', async (ctx) => {
    if (!redisAvailable) ctx.skip()

    const fingerprint = randomUUID()
    const started = await Promise.all(Array.from({ length: 5 }, () => pod()))
    const claims = await Promise.all(started.map((service) => service.claim(tenantId, fingerprint)))

    const winners = claims.filter((claim) => claim.kind === 'proceed')
    expect(winners).toHaveLength(1)
    const winnerId = winners[0].kind === 'proceed' ? winners[0].notifyId : undefined

    // Every loser is handed the winner's id, even though its row does not exist yet.
    for (const claim of claims.filter((c) => c.kind === 'duplicate')) {
      expect(claim.kind === 'duplicate' && claim.original.notifyId).toBe(winnerId)
    }
  })

  it('frees the fingerprint on release, and expires it with the window', async (ctx) => {
    if (!redisAvailable) ctx.skip()

    const fingerprint = randomUUID()
    const first = await (await pod()).claim(tenantId, fingerprint)
    if (first.kind !== 'proceed') throw new Error('expected a claim')

    const ttl = await admin.pttl(redisKey(`dedup:${tenantId}:${fingerprint}`))
    expect(ttl).toBeGreaterThan(55_000)
    expect(ttl).toBeLessThanOrEqual(60_000)

    await first.release()
    expect((await (await pod()).claim(tenantId, fingerprint)).kind).toBe('proceed')
  })
})
