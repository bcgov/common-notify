import { Logger } from '@nestjs/common'
import { randomInt, randomUUID } from 'node:crypto'
import type Redis from 'ioredis'

/**
 * Whether a call may go ahead. Open: wait. Half-open (cooldown over, not yet confirmed healthy):
 * one caller - the one that takes the probe lock - goes ahead, the rest wait. Otherwise closed.
 */
const ENTER_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 'wait' end
if redis.call('EXISTS', KEYS[2]) == 1 then
  if redis.call('SET', KEYS[3], ARGV[1], 'NX', 'PX', ARGV[2]) then return 'probe' end
  return 'wait'
end
return 'go'
`

/**
 * Record a failed call. A failed probe reopens straight away. Otherwise the failure is counted in
 * a sliding window, on Redis's clock, and reaching the threshold opens the circuit.
 */
const FAILURE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local window, threshold, cooldown = tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
if ARGV[5] == '1' then
  redis.call('SET', KEYS[1], now + cooldown, 'PX', cooldown)
  redis.call('DEL', KEYS[3], KEYS[4])
  return 'reopened'
end
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 'ignored' end
redis.call('ZADD', KEYS[4], now, ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now - window)
redis.call('PEXPIRE', KEYS[4], window)
if redis.call('ZCARD', KEYS[4]) >= threshold then
  redis.call('SET', KEYS[1], now + cooldown, 'PX', cooldown)
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[6])
  redis.call('DEL', KEYS[4])
  return 'opened'
end
return 'counted'
`

export interface CircuitBreakerOptions {
  /** Failures within `windowMs` that open the circuit. */
  failureThreshold: number
  windowMs: number
  /** How long the circuit stays open before one probe call is let through. */
  cooldownMs: number
  /** How long a probe may run before another caller may probe. Longer than the slowest call. */
  probeTimeoutMs: number
  /** Which errors mean the dependency is unwell. Anything else proves it answered. */
  isFailure: (error: unknown) => boolean
  /** Wait between checks while open; each wait is jittered up to double this. */
  pollMs?: number
}

export type CircuitState =
  | { state: 'closed' }
  | { state: 'open'; reopensAt: string }
  | { state: 'half-open' }

/** How long the half-open flag outlives its last use, so an abandoned one cannot linger. */
const HALF_OPEN_TTL_MS = 24 * 60 * 60 * 1000
const FAIL_OPEN_WARN_INTERVAL_MS = 60_000

export const circuitKeys = (base: string) => ({
  open: `${base}:open`,
  halfOpen: `${base}:half-open`,
  probe: `${base}:probe`,
  failures: `${base}:failures`,
})

/** The circuit's state, for display. Null when Redis cannot be read. */
export async function readCircuitState(redis: Redis, base: string): Promise<CircuitState | null> {
  const keys = circuitKeys(base)
  try {
    const [openUntil, halfOpen] = await Promise.all([
      redis.get(keys.open),
      redis.exists(keys.halfOpen),
    ])
    if (openUntil) return { state: 'open', reopensAt: new Date(Number(openUntil)).toISOString() }
    return halfOpen ? { state: 'half-open' } : { state: 'closed' }
  } catch {
    return null
  }
}

/**
 * Stops every pod calling a dependency that is failing, until it recovers.
 *
 * Without it, an outage is met with a call for every piece of work waiting: each fails at once,
 * so the backlog drains into failures, and the dependency is hit hardest while it is trying to
 * come back. With it, a few failures in quick succession open the circuit and calls wait instead
 * of being made. After a cooldown one probe call goes through; if it succeeds the circuit closes
 * and the waiting calls proceed, and if it fails the cooldown starts again.
 *
 * State lives in Redis, so all pods open and close together. Fails open: if Redis cannot be
 * reached, calls go ahead as if the circuit were closed.
 */
export class RedisCircuitBreaker {
  private readonly logger = new Logger(RedisCircuitBreaker.name)
  private readonly keys: ReturnType<typeof circuitKeys>
  private lastFailOpenWarnAt = 0

  constructor(
    private readonly client: Redis,
    private readonly base: string,
    private readonly options: CircuitBreakerOptions,
  ) {
    this.keys = circuitKeys(base)
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const token = randomUUID()
    const probe = await this.enter(token)
    try {
      const result = await fn()
      if (probe) await this.closeAfterProbe()
      return result
    } catch (error) {
      if (this.options.isFailure(error)) await this.recordFailure(token, probe)
      else if (probe) await this.closeAfterProbe()
      throw error
    }
  }

  /** Waits while the circuit is open. True when this call is the half-open probe. */
  private async enter(token: string): Promise<boolean> {
    const pollMs = this.options.pollMs ?? 1000
    for (;;) {
      let verdict: unknown
      try {
        verdict = await this.client.eval(
          ENTER_SCRIPT,
          3,
          this.keys.open,
          this.keys.halfOpen,
          this.keys.probe,
          token,
          this.options.probeTimeoutMs,
        )
      } catch (error) {
        this.warnFailOpen(error as Error)
        return false
      }
      if (verdict === 'go') return false
      if (verdict === 'probe') return true
      // randomInt rather than Math.random: the jitter does not need to be unguessable, but
      // a CSPRNG costs nothing once per poll and keeps the rule honest about which
      // random source is which.
      await new Promise((resolve) => setTimeout(resolve, pollMs + randomInt(pollMs)))
    }
  }

  private async recordFailure(token: string, probe: boolean): Promise<void> {
    const { failureThreshold, windowMs, cooldownMs } = this.options
    try {
      const outcome = await this.client.eval(
        FAILURE_SCRIPT,
        4,
        this.keys.open,
        this.keys.halfOpen,
        this.keys.probe,
        this.keys.failures,
        token,
        windowMs,
        failureThreshold,
        cooldownMs,
        probe ? '1' : '0',
        HALF_OPEN_TTL_MS,
      )
      if (outcome === 'opened') {
        this.logger.warn(
          `Circuit ${this.base} opened after ${failureThreshold} failures in ${windowMs / 1000}s; calls wait ${cooldownMs / 1000}s, then one probe`,
        )
      } else if (outcome === 'reopened') {
        this.logger.warn(`Circuit ${this.base} probe failed; waiting another ${cooldownMs / 1000}s`)
      }
    } catch (error) {
      this.warnFailOpen(error as Error)
    }
  }

  private async closeAfterProbe(): Promise<void> {
    try {
      await this.client.del(this.keys.halfOpen, this.keys.probe, this.keys.failures)
      this.logger.log(`Circuit ${this.base} closed: probe succeeded`)
    } catch (error) {
      this.warnFailOpen(error as Error)
    }
  }

  private warnFailOpen(error: Error): void {
    const now = Date.now()
    if (now - this.lastFailOpenWarnAt < FAIL_OPEN_WARN_INTERVAL_MS) return
    this.lastFailOpenWarnAt = now
    this.logger.warn(`Circuit ${this.base} not applied: ${error.message}`)
  }
}
