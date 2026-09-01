import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CstarRolesResponseDto, CstarTenantsResponseDto } from './schemas/cstar.schema'

interface CstarErrorResponse {
  detail?: string
  message?: string
  errors?: Array<{ message: string }>
}

/**
 * CstarApiClient
 *
 * Service for calling CSTAR APIs to fetch user roles.
 * Makes HTTP requests to CSTAR to retrieve the authoritative list of roles
 * for a user in a specific tenant.
 *
 * CSTAR API Endpoint:
 * GET /api/v1/tenants/:tenantId/ssousers/:ssoUserId/shared-service-roles
 * Response: { data: { sharedServiceRoles: CstarRoleDto[] } }
 * Returns array of role name strings extracted from the response
 *
 * Usage:
 * ```typescript
 * const roles = await cstarApiClient.getUserRoles(tenantId, ssoUserId)
 * ```
 */
@Injectable()
export class CstarApiClient {
  private readonly logger = new Logger(CstarApiClient.name)
  private readonly baseUrl: string
  private static readonly SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/

  /**
   * Successful lookups, keyed by the identity they were fetched for. Only successes are
   * stored, and a Map is used rather than a plain object so a key like `__proto__`
   * (however unlikely, the key derives from a token claim) cannot pollute a prototype.
   */
  private readonly tenantsCache = new Map<string, { expiresAt: number; value: any[] }>()
  private readonly rolesCache = new Map<string, { expiresAt: number; value: string[] }>()
  /** Lookups currently in flight, so a burst of requests shares a single CSTAR call. */
  private readonly tenantsInFlight = new Map<string, Promise<any[]>>()
  private readonly rolesInFlight = new Map<string, Promise<string[]>>()
  private readonly cacheTtlMs: number

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('cstar.baseUrl') || ''
    this.cacheTtlMs = this.configService.get<number>('cstar.userTenantsCacheTtlMs') ?? 15000
  }

  private validatePathSegment(value: string, fieldName: string): string {
    if (!CstarApiClient.SAFE_PATH_SEGMENT.test(value)) {
      throw new BadRequestException(`Invalid ${fieldName}`)
    }
    return value
  }

  /**
   * Fetch user's roles in a specific tenant from CSTAR
   *
   * @param tenantId The CSTAR tenant ID
   * @param ssoUserId The user's SSO/IDIR user ID (GUID)
   * @param authHeader Optional JWT Authorization header to authenticate with CSTAR
   * @returns Array of role strings assigned to the user in that tenant
   * @throws UnauthorizedException if user not found or credentials invalid
   * @throws ForbiddenException if user doesn't have access to tenant
   * @throws InternalServerErrorException if CSTAR API error
   */
  private async fetchUserRoles(
    tenantId: string,
    ssoUserId: string,
    authHeader?: string,
  ): Promise<string[]> {
    if (!this.baseUrl) {
      this.logger.error('CSTAR_API_URL is not configured')
      throw new InternalServerErrorException('CSTAR API is not configured')
    }

    const safeTenantId = encodeURIComponent(this.validatePathSegment(tenantId, 'tenantId'))
    const safeSsoUserId = encodeURIComponent(this.validatePathSegment(ssoUserId, 'ssoUserId'))
    const url = new URL(
      `/api/v1/tenants/${safeTenantId}/ssousers/${safeSsoUserId}/shared-service-roles`,
      this.baseUrl,
    ).toString()

    try {
      this.logger.debug(`Fetching shared service roles from CSTAR: ${url}`)

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      // If JWT token provided, pass it to CSTAR for authentication
      if (authHeader) {
        headers.Authorization = authHeader
        this.logger.debug(`Including Authorization header with CSTAR request`)
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        const errBody = await response.text()
        let errData: CstarErrorResponse | null = null
        try {
          errData = JSON.parse(errBody) as CstarErrorResponse
        } catch {
          this.logger.debug(`CSTAR API returned non-JSON error body: ${errBody.slice(0, 100)}`)
        }

        const message =
          errData?.detail ??
          errData?.message ??
          errData?.errors?.[0]?.message ??
          errBody ??
          response.statusText

        if (response.status === 401) {
          this.logger.warn(`CSTAR authentication failed for user ${ssoUserId}`, { tenantId })
          throw new UnauthorizedException(`User not authenticated with CSTAR: ${message}`)
        }

        if (response.status === 403) {
          this.logger.warn(
            `CSTAR authorization failed: user ${ssoUserId} not authorized for tenant ${tenantId}`,
          )
          throw new ForbiddenException(`User is not authorized to access this tenant: ${message}`)
        }

        if (response.status === 404) {
          this.logger.warn(`CSTAR returned 404 for user ${ssoUserId} in tenant ${tenantId}`)
          throw new ForbiddenException(`User not found in CSTAR for this tenant`)
        }

        this.logger.error(`CSTAR API error: ${response.status} ${message}`, {
          tenantId,
          ssoUserId,
        })
        throw new InternalServerErrorException(`CSTAR API error: ${response.status} - ${message}`)
      }

      const data = (await response.json()) as CstarRolesResponseDto
      const roleNames = data.data.sharedServiceRoles.map((role) => role.name)
      this.logger.debug(
        `Successfully fetched roles for user ${ssoUserId} in tenant ${tenantId} (${roleNames.length} roles: ${roleNames.join(', ')})`,
      )

      return roleNames
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      if (error instanceof ForbiddenException) {
        throw error
      }

      this.logger.error(
        `Failed to fetch CSTAR roles: ${error instanceof Error ? error.message : String(error)}`,
        {
          tenantId,
          ssoUserId,
        },
      )
      throw new InternalServerErrorException('Failed to fetch user roles from CSTAR')
    }
  }

  /**
   * Fetch user's accessible tenants from CSTAR
   *
   * @param ssoUserId The user's SSO/IDIR user ID (GUID)
   * @param authHeader Optional JWT Authorization header to authenticate with CSTAR
   * @returns Array of tenant objects the user has access to
   * @throws UnauthorizedException if user not found or credentials invalid
   * @throws InternalServerErrorException if CSTAR API error
   */
  /**
   * Reuse a recent result, and let concurrent callers share one in-flight request.
   *
   * Both CSTAR lookups sit on the hot path: NotifyFrontendRoleGuard calls getUserTenants
   * on every tenant-scoped frontend request and getUserRoles on every role-gated one, so
   * clicking quickly through the nav otherwise fires a burst of identical calls and the
   * failures surface as "Failed to verify tenant access".
   *
   * Failures are never cached: an error must not lock a user out for the whole window,
   * and a transient CSTAR problem should be retried by the very next request.
   */
  private cachedLookup<T>(
    cache: Map<string, { expiresAt: number; value: T }>,
    inFlight: Map<string, Promise<T>>,
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value)
    }

    const pending = inFlight.get(key)
    if (pending) {
      return pending
    }

    const request = fetcher()
      .then((value) => {
        if (this.cacheTtlMs > 0) {
          this.pruneExpired(cache)
          cache.set(key, { expiresAt: Date.now() + this.cacheTtlMs, value })
        }
        return value
      })
      .finally(() => {
        inFlight.delete(key)
      })

    inFlight.set(key, request)
    return request
  }

  /** Drop expired entries so a cache tracks active users, not every user ever seen. */
  private pruneExpired<T>(cache: Map<string, { expiresAt: number; value: T }>): void {
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(key)
      }
    }
  }

  /**
   * Reject an identifier that is missing or not a string before it is used as a cache key.
   *
   * The path-segment regexes below stringify their argument, so `undefined` becomes the
   * literal "undefined" and passes them. Harmless when every call went to CSTAR; not
   * harmless once results are cached, because every caller missing the claim would share
   * one entry.
   */
  private requireIdentifier(value: string, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestException(`Invalid ${field}`)
    }
    return value
  }

  /** The tenants a user belongs to, according to CSTAR. */
  async getUserTenants(ssoUserId: string, authHeader?: string): Promise<any[]> {
    this.requireIdentifier(ssoUserId, 'ssoUserId')
    return this.cachedLookup(this.tenantsCache, this.tenantsInFlight, ssoUserId, () =>
      this.fetchUserTenants(ssoUserId, authHeader),
    )
  }

  /**
   * A user's roles within one tenant.
   *
   * Keyed by tenant *and* user: a user holds different roles in different tenants, so the
   * tenant has to be part of the key or switching tenants would read the wrong entry.
   * ":" cannot appear in either identifier (see the path-segment regexes), so the two
   * halves cannot run together to forge another pair's key.
   */
  async getUserRoles(tenantId: string, ssoUserId: string, authHeader?: string): Promise<string[]> {
    this.requireIdentifier(tenantId, 'tenantId')
    this.requireIdentifier(ssoUserId, 'ssoUserId')
    return this.cachedLookup(this.rolesCache, this.rolesInFlight, `${tenantId}:${ssoUserId}`, () =>
      this.fetchUserRoles(tenantId, ssoUserId, authHeader),
    )
  }

  private async fetchUserTenants(ssoUserId: string, authHeader?: string): Promise<any[]> {
    if (!this.baseUrl) {
      this.logger.error('CSTAR_API_URL is not configured')
      throw new InternalServerErrorException('CSTAR API is not configured')
    }

    const isValidUserId = /^[A-Za-z0-9@._-]+$/.test(ssoUserId)
    if (!isValidUserId) {
      this.logger.warn(`Rejected invalid CSTAR user identifier format`)
      throw new UnauthorizedException('Invalid user identifier format')
    }

    const safeUserId = encodeURIComponent(ssoUserId)
    const url = new URL(`/api/v1/users/${safeUserId}/tenants`, this.baseUrl).toString()

    try {
      this.logger.debug(`Fetching tenants from CSTAR: ${url}`)

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      // If JWT token provided, pass it to CSTAR for authentication
      if (authHeader) {
        headers.Authorization = authHeader
        this.logger.debug(`Including Authorization header with CSTAR request`)
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        const errBody = await response.text()
        let errData: CstarErrorResponse | null = null
        try {
          errData = JSON.parse(errBody) as CstarErrorResponse
        } catch {
          this.logger.debug(`CSTAR API returned non-JSON error body: ${errBody.slice(0, 100)}`)
        }

        const message =
          errData?.detail ??
          errData?.message ??
          errData?.errors?.[0]?.message ??
          errBody ??
          response.statusText

        if (response.status === 401) {
          this.logger.warn(`CSTAR authentication failed for user ${ssoUserId}`)
          throw new UnauthorizedException(`User not authenticated with CSTAR: ${message}`)
        }

        if (response.status === 404) {
          this.logger.warn(`CSTAR returned 404 for user ${ssoUserId}`)
          throw new UnauthorizedException(`User not found in CSTAR`)
        }

        this.logger.error(`CSTAR API error: ${response.status} ${message}`, {
          ssoUserId,
        })
        throw new InternalServerErrorException(`CSTAR API error: ${response.status} - ${message}`)
      }

      const data = (await response.json()) as CstarTenantsResponseDto
      this.logger.debug(
        `Successfully fetched ${data.data.tenants.length} tenants for user ${ssoUserId}`,
      )

      // Return full tenant objects, not just IDs
      return data.data.tenants
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }

      this.logger.error(
        `Failed to fetch CSTAR tenants: ${error instanceof Error ? error.message : String(error)}`,
        {
          ssoUserId,
        },
      )
      throw new InternalServerErrorException('Failed to fetch user tenants from CSTAR')
    }
  }
}
