import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, randomUUID } from 'crypto'
import type Redis from 'ioredis'
import { formatRedisError } from '../../../common/redis/redis-error.util'
import { redisKey } from '../../../common/redis/redis-namespace'
import { createRedisClient, type RedisConfig } from '../../../queue/redis-connection'
import { NotificationStatus } from '../../../enum/notification-status.enum'
import { NotificationService } from '../../notification/notification.service'
import { PhoneNumberService } from './phone-number.service'

// Namespaced per deployment: the Redis instance is shared by every deployment in the namespace.
const DEDUP_KEY_PREFIX = redisKey('dedup:')

/**
 * Take the key if it is free, otherwise report who holds it. One script so the check and the
 * write are a single step: two pods claiming the same fingerprint cannot both see it free.
 */
const CLAIM_SCRIPT = `
local existing = redis.call("get", KEYS[1])
if existing then
  return existing
end
redis.call("set", KEYS[1], ARGV[1], "PX", ARGV[2])
return false
`

/**
 * Replace the holder only if it is still the one we looked at. Two retries of a failed send
 * both see the failed id; only the first swap succeeds, and the second then finds the new id.
 */
const TAKEOVER_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  redis.call("set", KEYS[1], ARGV[2], "PX", ARGV[3])
  return 1
end
return 0
`

/** Release only our own claim, never one another request has since taken over. */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

/**
 * Statuses that mean the original never reached its recipients, so an identical request is a
 * genuine resend rather than a duplicate. `cancelled` is written by cancelOrRescheduleNotification
 * and has no NotificationStatus member.
 */
const NOT_DELIVERED_STATUSES = new Set<string>([
  NotificationStatus.FAILED,
  NotificationStatus.QUARANTINED,
  NotificationStatus.BLOCKED,
  'cancelled',
])

/** How long startup waits for Redis before serving without it. */
const CONNECT_WAIT_MS = 2000

/** Bounds the claim/takeover loop; each pass only repeats when another request won a swap. */
const MAX_CLAIM_ATTEMPTS = 3

/** An identical request already accepted inside the window. */
export interface DuplicateNotification {
  notifyId: string
  /** The original's current status; ACCEPTED while its row is still being written. */
  status: string
  channels?: string[]
  createdAt: Date
}

export type DedupClaim =
  | { kind: 'duplicate'; original: DuplicateNotification }
  | {
      kind: 'proceed'
      /**
       * The id the caller must create the notification_request row with. Absent only when no
       * dedup service is wired in, leaving the database to generate one.
       */
      notifyId?: string
      /** Frees the claim when the row could not be created. A no-op if nothing was claimed. */
      release: () => Promise<void>
    }

/**
 * Suppresses identical sends within a window (NOTIFICATION_DEDUP_WINDOW_SECONDS, default 300).
 *
 * The claim lives in Redis because every pod must see it: `SET NX` style, keyed by tenant and a
 * fingerprint of the recipients and content, holding the notifyId the winner will create. The
 * id is generated before the row exists, so a duplicate arriving while the original is still
 * being written is answered with that id rather than refused.
 *
 * Callers claim only after every check that can reject the request (validation, safelist,
 * limits). Between the claim and the insert nothing else can fail, so a duplicate is never
 * handed an id that will not exist - short of the insert itself failing.
 *
 * Fails open: if Redis is unreachable the send proceeds undeduplicated. Blocking every
 * notification on the dedup store would be worse than an occasional duplicate.
 *
 * Redis here is noeviction (AGENTS.md §5.1). One key per accepted request, ~250 bytes, always
 * with the window as its TTL - mail merge is one key per request, not per row.
 */
@Injectable()
export class NotificationDedupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDedupService.name)
  private readonly client: Redis
  private readonly windowMs: number
  private readonly phoneNumberService = new PhoneNumberService()

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {
    this.windowMs = (this.configService.get<number>('dedup.windowSeconds') ?? 300) * 1000

    const redisConfig = this.configService.get<RedisConfig>('redis')
    this.client = createRedisClient(
      {
        host: redisConfig?.host ?? 'localhost',
        port: redisConfig?.port ?? 6379,
        password: redisConfig?.password,
        db: redisConfig?.db ?? 0,
      },
      NotificationDedupService.name,
      {
        // On the send path: a Redis outage has to degrade to "no dedup" in milliseconds,
        // not stall the request behind ioredis's offline queue. Not lazy: see onModuleInit.
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        commandTimeout: 250,
      },
    )
  }

  /** False when the window is 0 (or unparseable): every request proceeds. */
  get enabled(): boolean {
    return Number.isFinite(this.windowMs) && this.windowMs > 0
  }

  /**
   * Stable hash of a send. Recipients are normalised and sorted - so address order, case and
   * phone formatting don't make a request look new - and object keys are sorted. Everything
   * else (content, params, attachments, delayedSend, mergeArray) is hashed as given, so any
   * difference in what would be delivered makes it a different request.
   */
  fingerprint(payload: unknown): string {
    return createHash('sha256')
      .update(canonicalJson(this.normalizeRecipients(payload)))
      .digest('hex')
  }

  normalizeEmail(address: string): string {
    return address.trim().toLowerCase()
  }

  normalizePhone(number: string): string {
    return this.phoneNumberService.normalize(number) ?? number.trim()
  }

  /**
   * Read-only check, for callers with expensive work (attachment upload, SMS segment rendering)
   * ahead of their claim. A miss here is not a guarantee - `claim` is what decides.
   */
  async findDuplicate(
    tenantId: string,
    fingerprint: string,
  ): Promise<DuplicateNotification | null> {
    if (!this.enabled) return null

    let holder: string | null
    try {
      holder = await this.client.get(this.key(tenantId, fingerprint))
    } catch (error) {
      this.logger.debug(`Dedup lookup failed, continuing: ${formatRedisError(error)}`)
      return null
    }
    if (!holder) return null

    try {
      const original = await this.describe(holder, tenantId)
      return original && !NOT_DELIVERED_STATUSES.has(original.status) ? original : null
    } catch (error) {
      // Left to claim(), which makes the same lookup and decides.
      this.logger.debug(`Dedup lookup of ${holder} failed, continuing: ${String(error)}`)
      return null
    }
  }

  /** Claim the fingerprint for a new notifyId, or return the request that already holds it. */
  async claim(tenantId: string, fingerprint: string): Promise<DedupClaim> {
    const notifyId = randomUUID()
    const unclaimed: DedupClaim = { kind: 'proceed', notifyId, release: async () => {} }
    if (!this.enabled) return unclaimed

    const key = this.key(tenantId, fingerprint)
    const claimed: DedupClaim = {
      kind: 'proceed',
      notifyId,
      release: () => this.release(key, notifyId),
    }

    try {
      for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
        const holder = (await this.client.eval(
          CLAIM_SCRIPT,
          1,
          key,
          notifyId,
          String(this.windowMs),
        )) as string | null
        if (!holder) return claimed

        const original = await this.describe(holder, tenantId)
        if (original && !NOT_DELIVERED_STATUSES.has(original.status)) {
          this.logger.log(
            `Duplicate send suppressed: matches ${holder} (tenant=${tenantId}, status=${original.status})`,
          )
          return { kind: 'duplicate', original }
        }

        // The original never reached anyone, so this is a resend. Take the key over - a fresh
        // window from now - unless another retry swapped it first, in which case look again.
        const swapped = await this.client.eval(
          TAKEOVER_SCRIPT,
          1,
          key,
          holder,
          notifyId,
          String(this.windowMs),
        )
        if (swapped === 1) return claimed
      }
    } catch (error) {
      this.logger.warn(`Dedup unavailable, sending without it: ${formatRedisError(error)}`)
      return unclaimed
    }

    this.logger.warn(`Dedup claim contended ${MAX_CLAIM_ATTEMPTS} times, sending without it`)
    return unclaimed
  }

  /**
   * Hold startup until the connection is up. With no offline queue a command sent mid-handshake
   * is rejected, so without this a pod's first sends would skip dedup. Never fatal: after
   * CONNECT_WAIT_MS the pod starts anyway and fails open until Redis is reachable.
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled || this.client.status === 'ready') return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, CONNECT_WAIT_MS)
      this.client.once('ready', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect())
  }

  private key(tenantId: string, fingerprint: string): string {
    return `${DEDUP_KEY_PREFIX}${encodeURIComponent(tenantId)}:${fingerprint}`
  }

  private async release(key: string, notifyId: string): Promise<void> {
    try {
      await this.client.eval(RELEASE_SCRIPT, 1, key, notifyId)
    } catch (error) {
      // The key expires with the window regardless; a stuck claim only suppresses until then.
      this.logger.warn(`Failed to release dedup claim ${notifyId}: ${formatRedisError(error)}`)
    }
  }

  /**
   * The original request, or an in-flight placeholder when its row is not written yet. Null
   * only for a holder that is not an id at all (a corrupt or foreign value), which is treated
   * as free.
   */
  private async describe(holder: string, tenantId: string): Promise<DuplicateNotification | null> {
    if (!UUID_PATTERN.test(holder)) return null
    try {
      const record = await this.notificationService.findOne(holder, tenantId)
      return {
        notifyId: record.id,
        status: record.status,
        channels: record.channelCodes,
        createdAt: record.createdAt,
      }
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error
      return { notifyId: holder, status: NotificationStatus.ACCEPTED, createdAt: new Date() }
    }
  }

  private normalizeRecipients(payload: unknown): unknown {
    if (!isObject(payload)) return payload
    return {
      ...payload,
      email: this.normalizeChannel(payload.email, ['to', 'cc', 'bcc'], (a) =>
        this.normalizeEmail(a),
      ),
      sms: this.normalizeChannel(payload.sms, ['to'], (n) => this.normalizePhone(n)),
    }
  }

  private normalizeChannel(
    channel: unknown,
    fields: string[],
    normalize: (value: string) => string,
  ): unknown {
    if (!isObject(channel) || !isObject(channel.recipients)) return channel
    const recipients: Record<string, unknown> = { ...channel.recipients }
    for (const field of fields) {
      const values = recipients[field]
      if (Array.isArray(values)) {
        recipients[field] = values.map((v) => (typeof v === 'string' ? normalize(v) : v)).sort()
      }
    }
    return { ...channel, recipients }
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON with object keys sorted at every level, so key order never changes the hash. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isObject(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  )
}
