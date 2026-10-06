import { describe, it, expect, vi } from 'vitest'
import type Redis from 'ioredis'
import { RedisCircuitBreaker, circuitKeys, readCircuitState } from './circuit-breaker'

const BASE = 'notify:test:circuit'
const keys = circuitKeys(BASE)

/** The breaker's two scripts over an in-memory store: key -> { value, expiresAt }. */
function fakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>()
  const failures: number[] = []
  const live = (key: string) => {
    const entry = store.get(key)
    if (entry && entry.expiresAt <= Date.now()) store.delete(key)
    return store.get(key)
  }
  const set = (key: string, value: string, ttlMs: number) =>
    store.set(key, { value, expiresAt: Date.now() + Number(ttlMs) })
  return {
    store,
    eval: vi.fn(async (_script: string, numKeys: number, ...args: unknown[]) => {
      const [open, halfOpen, probe] = args as string[]
      if (numKeys === 3) {
        const [, , , token, probeMs] = args as [string, string, string, string, number]
        if (live(open)) return 'wait'
        if (live(halfOpen)) {
          if (live(probe)) return 'wait'
          set(probe, token, probeMs)
          return 'probe'
        }
        return 'go'
      }
      const [, , , , , windowMs, threshold, cooldownMs, isProbe, halfOpenTtl] = args as [
        string,
        string,
        string,
        string,
        string,
        number,
        number,
        number,
        string,
        number,
      ]
      const now = Date.now()
      if (isProbe === '1') {
        set(open, String(now + cooldownMs), cooldownMs)
        store.delete(probe)
        return 'reopened'
      }
      if (live(open) || live(halfOpen)) return 'ignored'
      failures.push(now)
      while (failures.length && failures[0] <= now - windowMs) failures.shift()
      if (failures.length >= threshold) {
        set(open, String(now + cooldownMs), cooldownMs)
        set(halfOpen, '1', halfOpenTtl)
        failures.length = 0
        return 'opened'
      }
      return 'counted'
    }),
    del: vi.fn(async (...deleted: string[]) => {
      deleted.forEach((key) => store.delete(key))
      return deleted.length
    }),
    get: vi.fn(async (key: string) => live(key)?.value ?? null),
    exists: vi.fn(async (key: string) => (live(key) ? 1 : 0)),
  }
}

class Outage extends Error {}

const breakerOn = (redis: ReturnType<typeof fakeRedis>) =>
  new RedisCircuitBreaker(redis as unknown as Redis, BASE, {
    failureThreshold: 3,
    windowMs: 10_000,
    cooldownMs: 30,
    probeTimeoutMs: 1_000,
    isFailure: (error) => error instanceof Outage,
    pollMs: 5,
  })

const fail = () => Promise.reject(new Outage('503'))
const ok = () => Promise.resolve('sent')

describe('RedisCircuitBreaker', () => {
  it('lets calls through while the dependency is healthy', async () => {
    await expect(breakerOn(fakeRedis()).run(ok)).resolves.toBe('sent')
  })

  it('opens after the threshold of failures, so further calls wait instead of being made', async () => {
    const redis = fakeRedis()
    const breaker = breakerOn(redis)
    for (let i = 0; i < 3; i++) await expect(breaker.run(fail)).rejects.toThrow('503')

    expect(await readCircuitState(redis as unknown as Redis, BASE)).toMatchObject({
      state: 'open',
    })
    const call = vi.fn(ok)
    const waiting = breaker.run(call)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(call).not.toHaveBeenCalled()

    // After the cooldown the waiting call is the probe; it succeeds and closes the circuit.
    await expect(waiting).resolves.toBe('sent')
    expect(await readCircuitState(redis as unknown as Redis, BASE)).toEqual({ state: 'closed' })
  })

  it('lets one probe through after the cooldown, and reopens if it fails', async () => {
    const redis = fakeRedis()
    const breaker = breakerOn(redis)
    for (let i = 0; i < 3; i++) await breaker.run(fail).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 40))

    await expect(breaker.run(fail)).rejects.toThrow('503')

    expect(await readCircuitState(redis as unknown as Redis, BASE)).toMatchObject({
      state: 'open',
    })
  })

  it('does not count errors that are not the dependency failing', async () => {
    const redis = fakeRedis()
    const breaker = breakerOn(redis)
    for (let i = 0; i < 5; i++) {
      await expect(breaker.run(() => Promise.reject(new Error('bad address')))).rejects.toThrow()
    }
    expect(await readCircuitState(redis as unknown as Redis, BASE)).toEqual({ state: 'closed' })
  })

  it('closes when the probe gets any answer from the dependency, even a rejection', async () => {
    const redis = fakeRedis()
    const breaker = breakerOn(redis)
    for (let i = 0; i < 3; i++) await breaker.run(fail).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 40))

    await expect(breaker.run(() => Promise.reject(new Error('bad address')))).rejects.toThrow()

    expect(redis.store.has(keys.halfOpen)).toBe(false)
  })

  it('lets calls through when Redis cannot be reached', async () => {
    const redis = fakeRedis()
    redis.eval.mockRejectedValue(new Error('Connection is closed.'))
    await expect(breakerOn(redis).run(ok)).resolves.toBe('sent')
    await expect(breakerOn(redis).run(fail)).rejects.toThrow('503')
  })
})
