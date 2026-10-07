import { Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type Redis from 'ioredis'

/**
 * Take a slot if fewer than ARGV[3] are held. Each held slot is a sorted-set member scored by
 * when it expires; expired ones are dropped first. Uses Redis's clock so every pod agrees.
 */
const ACQUIRE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
  return 1
end
return 0
`

export interface ConcurrencyLimiterOptions {
  /** Most calls in flight at once, across every pod sharing `key`. */
  limit: number
  /** How long a slot is held if never released. Longer than the slowest call it guards. */
  leaseMs: number
  /** Wait between attempts to take a slot; each wait is jittered up to double this. */
  pollMs?: number
}

const FAIL_OPEN_WARN_INTERVAL_MS = 60_000

/**
 * "At most N of these calls at once, across every pod." `run(fn)` waits for a free slot, runs
 * `fn`, and gives the slot back. The slots live in Redis, so all pods share one count.
 *
 * Used for CHES. CHES accepts about one email a second however many we send at once. A large
 * mail merge runs many batches in parallel on several pods, each sending one recipient at a
 * time, so dozens of requests reach CHES together. They do not finish sooner; they queue
 * inside CHES, each request takes longer, and some pass our request timeout and are marked
 * failed. Waiting for a slot on our side keeps the queue here, where nothing times out, and
 * delivers just as many emails a minute.
 *
 * A slot is a lease with an expiry, so a pod that dies mid-call cannot hold one forever.
 * Fails open: if Redis cannot be reached, calls run unlimited rather than stopping delivery.
 */
export class RedisConcurrencyLimiter {
  private readonly logger = new Logger(RedisConcurrencyLimiter.name)
  private lastFailOpenWarnAt = 0

  constructor(
    private readonly client: Redis,
    private readonly key: string,
    private readonly options: ConcurrencyLimiterOptions,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const token = await this.acquire()
    try {
      return await fn()
    } finally {
      if (token) await this.client.zrem(this.key, token).catch(() => undefined)
    }
  }

  /** The lease token once a slot is held, or null when Redis failed and the call runs unlimited. */
  private async acquire(): Promise<string | null> {
    const token = randomUUID()
    const pollMs = this.options.pollMs ?? 200
    for (;;) {
      let acquired: unknown
      try {
        acquired = await this.client.eval(
          ACQUIRE_SCRIPT,
          1,
          this.key,
          token,
          this.options.leaseMs,
          this.options.limit,
        )
      } catch (error) {
        this.warnFailOpen(error as Error)
        return null
      }
      if (acquired === 1) return token
      await new Promise((resolve) => setTimeout(resolve, pollMs + Math.random() * pollMs))
    }
  }

  private warnFailOpen(error: Error): void {
    const now = Date.now()
    if (now - this.lastFailOpenWarnAt < FAIL_OPEN_WARN_INTERVAL_MS) return
    this.lastFailOpenWarnAt = now
    this.logger.warn(`Concurrency limit on ${this.key} not applied: ${error.message}`)
  }
}
