import { describe, it, expect, vi } from 'vitest'
import type Redis from 'ioredis'
import { RedisConcurrencyLimiter } from './concurrency-limiter'

/** The acquire script's behaviour over an in-memory set of leases: token -> expiry. */
function fakeRedis(leases = new Map<string, number>()) {
  return {
    leases,
    eval: vi.fn(
      async (
        _script: string,
        _keys: number,
        _key: string,
        token: string,
        leaseMs: number,
        limit: number,
      ) => {
        const now = Date.now()
        for (const [held, expiresAt] of leases) if (expiresAt <= now) leases.delete(held)
        if (leases.size >= limit) return 0
        leases.set(token, now + leaseMs)
        return 1
      },
    ),
    zrem: vi.fn(async (_key: string, token: string) => (leases.delete(token) ? 1 : 0)),
  }
}

const limiterOn = (redis: ReturnType<typeof fakeRedis>, limit = 2) =>
  new RedisConcurrencyLimiter(redis as unknown as Redis, 'notify:test:in-flight', {
    limit,
    leaseMs: 60_000,
    pollMs: 1,
  })

describe('RedisConcurrencyLimiter', () => {
  it('never runs more than the limit at once, and runs every call', async () => {
    const limiter = limiterOn(fakeRedis(), 3)
    let running = 0
    let peak = 0
    const call = async (i: number) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
      return i
    }

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => limiter.run(() => call(i))),
    )

    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(peak).toBe(3)
  })

  it('frees the slot when the call throws', async () => {
    const redis = fakeRedis()
    const limiter = limiterOn(redis, 1)

    await expect(limiter.run(() => Promise.reject(new Error('CHES down')))).rejects.toThrow(
      'CHES down',
    )

    expect(redis.leases.size).toBe(0)
    await expect(limiter.run(() => Promise.resolve('next'))).resolves.toBe('next')
  })

  it('reclaims a slot whose holder never released it', async () => {
    const redis = fakeRedis(new Map([['pod-that-died', Date.now() - 1]]))

    await expect(limiterOn(redis, 1).run(() => Promise.resolve('ran'))).resolves.toBe('ran')
  })

  it('runs the call unlimited when Redis cannot be reached', async () => {
    const redis = fakeRedis()
    redis.eval.mockRejectedValue(new Error('Connection is closed.'))
    const limiter = limiterOn(redis, 1)

    await expect(limiter.run(() => Promise.resolve('sent'))).resolves.toBe('sent')
    await expect(limiter.run(() => Promise.resolve('sent'))).resolves.toBe('sent')
    expect(redis.zrem).not.toHaveBeenCalled()
  })
})
