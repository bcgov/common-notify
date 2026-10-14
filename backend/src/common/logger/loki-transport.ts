import * as http from 'node:http'
import { trimCharEnd } from '../utils/trim-char'
import * as https from 'node:https'
import { URL } from 'node:url'
import TransportStream from 'winston-transport'

const MESSAGE = Symbol.for('message') as unknown as string

/**
 * Winston transport that pushes to Loki's JSON API.
 *
 * This replaces the `winston-loki` package, which lost logs silently in three
 * ways and left prod with no log-based alerting for weeks:
 *
 *  1. Its JSON batch emitted a third element per value — the raw winston meta
 *     object — as Loki structured metadata. Loki requires a flat string map
 *     there, so any log carrying nested meta (an HTTP request with a
 *     user-agent, say) made Loki reject the WHOLE batch with 400.
 *  2. Its request helper resolved on any HTTP status, so that 400 was recorded
 *     as a successful send and the batch was dropped without a word.
 *  3. It set no 'timeout' listener, so a stalled socket never settled and the
 *     batching loop stopped forever.
 *
 * Here: values are [ts, line] only, non-2xx rejects, and the request is
 * destroyed on timeout. A failed batch is dropped — logging must never block
 * the request path or grow without bound — but it is always reported.
 */
export interface LokiTransportOptions extends TransportStream.TransportStreamOptions {
  url: string
  labels: Record<string, string>
  flushIntervalMs?: number
  timeoutMs?: number
  maxQueueEntries?: number
  maxEntriesPerRequest?: number
  report?: (message: string) => void
}

interface QueuedEntry {
  level: string
  ts: string
  line: string
}

export class LokiTransport extends TransportStream {
  private readonly endpoint: URL
  private readonly labels: Record<string, string>
  private readonly flushIntervalMs: number
  private readonly timeoutMs: number
  private readonly maxQueueEntries: number
  private readonly maxEntriesPerRequest: number
  private readonly report: (message: string) => void

  private queue: QueuedEntry[] = []
  private timer?: NodeJS.Timeout
  private inFlight = false
  private droppedEntries = 0
  private consecutiveFailures = 0
  private lastMs = 0
  private subMs = 0

  constructor(options: LokiTransportOptions) {
    super(options)
    const base = trimCharEnd(options.url, '/')
    this.endpoint = new URL(base.endsWith('/loki/api/v1/push') ? base : `${base}/loki/api/v1/push`)
    this.labels = Object.fromEntries(
      Object.entries(options.labels).map(([k, v]) => [k, String(v ?? '')]),
    )
    this.flushIntervalMs = options.flushIntervalMs ?? 5000
    this.timeoutMs = options.timeoutMs ?? 10000
    this.maxQueueEntries = options.maxQueueEntries ?? 10000
    this.maxEntriesPerRequest = options.maxEntriesPerRequest ?? 1000
    this.report =
      options.report ??
      ((message: string) => {
        process.stderr.write(`[loki-transport] ${message}\n`)
      })

    this.timer = setInterval(() => {
      void this.flush()
    }, this.flushIntervalMs)
    this.timer.unref?.()
  }

  log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(() => this.emit('logged', info))

    const line =
      typeof info[MESSAGE] === 'string' ? (info[MESSAGE] as string) : JSON.stringify(info)
    const level = (info[Symbol.for('level') as unknown as string] ?? info.level ?? 'info') as string
    const parsed = info.timestamp ? new Date(info.timestamp as string).valueOf() : Date.now()

    this.queue.push({
      level,
      line,
      ts: this.nanoTimestamp(Number.isNaN(parsed) ? Date.now() : parsed),
    })

    if (this.queue.length > this.maxQueueEntries) {
      const overflow = this.queue.length - this.maxQueueEntries
      this.queue.splice(0, overflow)
      this.droppedEntries += overflow
    }

    callback()
  }

  /**
   * Loki silently discards an entry that repeats an existing (stream, timestamp,
   * line) exactly. Winston only gives millisecond precision, so N identical
   * lines logged in the same millisecond — N copies of one error, say — would
   * collapse to a single line and undercount every count_over_time threshold
   * built on top of them. Spend the nanosecond field on a per-millisecond
   * sequence so each entry stays distinct.
   */
  private nanoTimestamp(ms: number): string {
    if (ms === this.lastMs) {
      this.subMs = Math.min(this.subMs + 1, 999_999)
    } else {
      this.lastMs = ms
      this.subMs = 0
    }
    return `${ms}${String(this.subMs).padStart(6, '0')}`
  }

  async flush(): Promise<void> {
    if (this.inFlight || this.queue.length === 0) return

    const batch = this.queue.slice(0, this.maxEntriesPerRequest)
    this.queue = this.queue.slice(this.maxEntriesPerRequest)
    this.inFlight = true

    try {
      await this.send(this.buildPayload(batch))
      if (this.consecutiveFailures > 0) {
        this.report(`recovered after ${this.consecutiveFailures} failed batch(es)`)
        this.consecutiveFailures = 0
      }
      if (this.droppedEntries > 0) {
        this.report(`dropped ${this.droppedEntries} entries while the queue was full`)
        this.droppedEntries = 0
      }
    } catch (err) {
      this.consecutiveFailures += 1
      if (this.consecutiveFailures <= 3 || this.consecutiveFailures % 50 === 0) {
        this.report(
          `dropped a batch of ${batch.length} entries (failure #${this.consecutiveFailures}): ${(err as Error).message}`,
        )
      }
    } finally {
      this.inFlight = false
    }
  }

  private buildPayload(batch: QueuedEntry[]): string {
    const byLevel = new Map<string, Array<[string, string]>>()
    for (const entry of batch) {
      const values = byLevel.get(entry.level) ?? []
      values.push([entry.ts, entry.line])
      byLevel.set(entry.level, values)
    }
    return JSON.stringify({
      streams: [...byLevel.entries()].map(([level, values]) => ({
        stream: { ...this.labels, level },
        values,
      })),
    })
  }

  private send(payload: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = Buffer.from(payload, 'utf8')
      const lib = this.endpoint.protocol === 'https:' ? https : http

      const req = lib.request(
        {
          hostname: this.endpoint.hostname,
          port: this.endpoint.port || (this.endpoint.protocol === 'https:' ? 443 : 80),
          path: this.endpoint.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
        },
        (res) => {
          let responseBody = ''
          res.on('data', (chunk) => {
            if (responseBody.length < 500) responseBody += chunk
          })
          res.on('end', () => {
            const status = res.statusCode ?? 0
            if (status >= 200 && status < 300) {
              resolve()
            } else {
              reject(
                new Error(`Loki returned HTTP ${status}: ${responseBody.trim().slice(0, 300)}`),
              )
            }
          })
        },
      )

      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error(`push timed out after ${this.timeoutMs}ms`))
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const remaining = this.queue.length
      await this.flush()
      if (this.queue.length >= remaining) break
    }
  }

  close(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    void this.drain()
  }
}

export default LokiTransport
