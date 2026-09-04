import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Redis from 'ioredis'
import { formatRedisError } from '../../common/redis/redis-error.util'
import { createRedisClient, type RedisConfig } from '../../queue/redis-connection'

const TENANTS_KEY_PREFIX = 'cstar:tenants:'
const ROLES_KEY_PREFIX = 'cstar:roles:'

/**
 * Redis-backed cache for the two CSTAR lookups on the authorization hot path. Shared by
 * every pod, and each key is deletable, so a membership change can be applied ahead of the
 * TTL.
 *
 * Three rules hold throughout:
 *
 * 1. A miss is never a denial. Reads return null - for a miss, a malformed entry or a
 *    Redis failure alike - and null means "ask CSTAR".
 * 2. Values are shape-checked on read. Redis contents outlive the process, so a deploy can
 *    read the previous schema version's JSON.
 * 3. Only successes are written, so a CSTAR error cannot lock a user out for the TTL.
 */
@Injectable()
export class CstarCacheStore implements OnModuleDestroy {
  private readonly logger = new Logger(CstarCacheStore.name)
  private readonly client: Redis
  private readonly ttlMs: number

  constructor(private readonly configService: ConfigService) {
    this.ttlMs = this.configService.get<number>('cstar.userTenantsCacheTtlMs') ?? 15000

    // Fail fast rather than queue: this sits in front of every tenant-scoped request, so a
    // Redis outage has to degrade to a live CSTAR call in milliseconds.
    const redisConfig = this.configService.get<RedisConfig>('redis')
    this.client = createRedisClient(
      {
        host: redisConfig?.host ?? 'localhost',
        port: redisConfig?.port ?? 6379,
        password: redisConfig?.password,
        db: redisConfig?.db ?? 0,
      },
      CstarCacheStore.name,
      {
        // Connect on first use: a cache must not open a socket just because the module
        // loaded, and an unreachable Redis then surfaces as a rejected command, which the
        // read and write paths already treat as a miss.
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        commandTimeout: 250,
      },
    )
  }

  /** False when the TTL is 0: no reads, no writes, leaving only the client's coalescing. */
  get enabled(): boolean {
    return this.ttlMs > 0
  }

  /** The tenants CSTAR last reported for a user, or null to go and ask. */
  async readTenants(ssoUserId: string): Promise<unknown[] | null> {
    return this.read(this.tenantsKey(ssoUserId), isTenantList)
  }

  async writeTenants(ssoUserId: string, tenants: unknown[]): Promise<void> {
    await this.write(this.tenantsKey(ssoUserId), tenants)
  }

  /** A user's roles in one tenant. Keyed by both: roles differ per tenant. */
  async readRoles(tenantId: string, ssoUserId: string): Promise<string[] | null> {
    return this.read(this.rolesKey(tenantId, ssoUserId), isRoleList)
  }

  async writeRoles(tenantId: string, ssoUserId: string, roles: string[]): Promise<void> {
    await this.write(this.rolesKey(tenantId, ssoUserId), roles)
  }

  /** Drop a user's entries so the next request re-reads CSTAR. */
  async invalidateUser(ssoUserId: string, tenantId?: string): Promise<void> {
    const keys = tenantId
      ? [this.tenantsKey(ssoUserId), this.rolesKey(tenantId, ssoUserId)]
      : [this.tenantsKey(ssoUserId)]
    try {
      await this.client.del(...keys)
    } catch (error) {
      this.logger.warn(`Failed to invalidate CSTAR cache: ${formatRedisError(error)}`)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect())
  }

  /**
   * Identifiers come from token claims and ":" separates key segments, so each segment is
   * percent-encoded: no claim value can span the separator into another pair's entry.
   */
  private tenantsKey(ssoUserId: string): string {
    return `${TENANTS_KEY_PREFIX}${encodeURIComponent(ssoUserId)}`
  }

  private rolesKey(tenantId: string, ssoUserId: string): string {
    return `${ROLES_KEY_PREFIX}${encodeURIComponent(tenantId)}:${encodeURIComponent(ssoUserId)}`
  }

  private async read<T>(key: string, isValid: (value: unknown) => value is T): Promise<T | null> {
    if (!this.enabled) {
      return null
    }

    let raw: string | null
    try {
      raw = await this.client.get(key)
    } catch (error) {
      // Debug, not error: during an outage this runs on every request, and the connection
      // failure is already logged by the listener createRedisClient attaches.
      this.logger.debug(
        `CSTAR cache read failed, falling back to CSTAR: ${formatRedisError(error)}`,
      )
      return null
    }

    if (raw === null) {
      return null
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isValid(parsed)) {
        this.logger.warn(`Discarding malformed CSTAR cache entry for key ${key}`)
        return null
      }
      return parsed
    } catch {
      this.logger.warn(`Discarding unparseable CSTAR cache entry for key ${key}`)
      return null
    }
  }

  private async write(key: string, value: unknown): Promise<void> {
    if (!this.enabled) {
      return
    }

    try {
      await this.client.set(key, JSON.stringify(value), 'PX', this.ttlMs)
    } catch (error) {
      // A failed write is a miss next time round, nothing more.
      this.logger.debug(`CSTAR cache write failed: ${formatRedisError(error)}`)
    }
  }
}

/** CSTAR returns tenants as bare id strings or as objects; the guard normalises both. */
function isTenantList(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        (typeof entry === 'string' && entry.length > 0) ||
        (typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { id?: unknown }).id === 'string'),
    )
  )
}

function isRoleList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}
