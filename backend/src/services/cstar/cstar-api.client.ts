import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CstarCacheStore } from './cstar-cache.store'
import type {
  CstarGroupDto,
  CstarGroupsResponseDto,
  CstarTenantUsersResponseDto,
  CstarRolesResponseDto,
  CstarTenantsResponseDto,
} from './schemas/cstar.schema'

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
   * Lookups currently in flight, so a burst of requests shares a single CSTAR call.
   * Process-local by design: these are unresolved promises, which cannot be shared through
   * Redis. The values themselves live in CstarCacheStore, where every pod sees them.
   */
  private readonly tenantsInFlight = new Map<string, Promise<any[]>>()
  private readonly rolesInFlight = new Map<string, Promise<string[]>>()

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheStore: CstarCacheStore,
  ) {
    this.baseUrl = this.configService.get<string>('cstar.baseUrl') || ''
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
   * Reuse a cached result, and let concurrent callers share one in-flight request. Both
   * lookups sit on the hot path: NotifyFrontendRoleGuard calls getUserTenants on every
   * tenant-scoped frontend request and getUserRoles on every role-gated one.
   *
   * Failures are never cached - the write runs only on a resolved fetch - so a transient
   * CSTAR problem is retried by the very next request rather than locking a user out.
   */
  private async cachedLookup<T>(
    inFlight: Map<string, Promise<T>>,
    key: string,
    readCache: () => Promise<T | null>,
    writeCache: (value: T) => Promise<void>,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    // Join before reading: an in-flight request exists only after a miss, so Redis has
    // nothing to offer that this promise will not deliver sooner.
    const pending = inFlight.get(key)
    if (pending) {
      return pending
    }

    const cached = await readCache()
    if (cached !== null) {
      return cached
    }

    // Re-check: the read is asynchronous, so two callers can both pass the check above
    // before either registers, and would each then call CSTAR.
    const started = inFlight.get(key)
    if (started) {
      return started
    }

    const request = fetcher()
      .then(async (value) => {
        await writeCache(value)
        return value
      })
      .finally(() => {
        inFlight.delete(key)
      })

    inFlight.set(key, request)
    return request
  }

  /**
   * Reject a missing or non-string identifier before it becomes a cache key. The
   * path-segment regexes stringify their argument, so `undefined` passes them as the
   * literal "undefined", and every caller missing the claim would share one entry.
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
    return this.cachedLookup(
      this.tenantsInFlight,
      ssoUserId,
      () => this.cacheStore.readTenants(ssoUserId),
      (value) => this.cacheStore.writeTenants(ssoUserId, value),
      () => this.fetchUserTenants(ssoUserId, authHeader),
    )
  }

  /**
   * A user's roles within one tenant. Keyed by tenant and user: a user holds different
   * roles in different tenants, so switching tenants must not read the same entry.
   */
  async getUserRoles(tenantId: string, ssoUserId: string, authHeader?: string): Promise<string[]> {
    this.requireIdentifier(tenantId, 'tenantId')
    this.requireIdentifier(ssoUserId, 'ssoUserId')
    return this.cachedLookup(
      this.rolesInFlight,
      `${tenantId}:${ssoUserId}`,
      () => this.cacheStore.readRoles(tenantId, ssoUserId),
      (value) => this.cacheStore.writeRoles(tenantId, ssoUserId, value),
      () => this.fetchUserRoles(tenantId, ssoUserId, authHeader),
    )
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

  /**
   * The groups that a CSTAR tenant belongs to. Used to populate the group picker on a notification
   * event's Email settings tab and to check that the group IDs being saved belong to that tenant.
   *
   * @param tenantId The CSTAR tenant ID (notify's tenant.externalId)
   * @param authHeader JWT Authorization header to authenticate with CSTAR
   */
  async getTenantGroups(tenantId: string, authHeader?: string): Promise<CstarGroupDto[]> {
    this.requireIdentifier(tenantId, 'tenantId')
    const safeTenantId = encodeURIComponent(this.validatePathSegment(tenantId, 'tenantId'))

    const body = await this.cstarGet<CstarGroupsResponseDto>(
      `/api/v1/tenants/${safeTenantId}/groups`,
      authHeader,
      `groups for tenant ${tenantId}`,
    )

    return body.data?.groups ?? []
  }

  /**
   * The email addresses of the members of one or more CSTAR groups, for sending a
   * notification to those groups.
   *
   * Resolved through the tenant users endpoint filtered by `groupIds` rather than through
   * GET groups/{groupId}?expand=groupUsers: that endpoint requires a CSTAR audience token,
   * while this one accepts the shared service audience token we authenticate to CSTAR with.
   * It also takes the whole group list at once, so a recipient field costs one call rather
   * than one per group.
   *
   * Users without a usable address (no SSO user, or no email on it) are dropped rather than
   * returned as blanks, and addresses are de-duplicated: one person in two of an event's
   * groups should be mailed once.
   *
   * @param tenantId The CSTAR tenant ID (notify's tenant.externalId)
   * @param groupIds The CSTAR group IDs whose members to resolve
   * @param authHeader JWT Authorization header to authenticate with CSTAR
   */
  async getGroupMemberEmails(
    tenantId: string,
    groupIds: string[],
    authHeader?: string,
  ): Promise<string[]> {
    this.requireIdentifier(tenantId, 'tenantId')
    const safeTenantId = encodeURIComponent(this.validatePathSegment(tenantId, 'tenantId'))

    const safeGroupIds = groupIds.map((groupId, index) => {
      this.requireIdentifier(groupId, `groupIds[${index}]`)
      return this.validatePathSegment(groupId, `groupIds[${index}]`)
    })
    if (safeGroupIds.length === 0) {
      return []
    }

    const body = await this.cstarGet<CstarTenantUsersResponseDto>(
      `/api/v1/tenants/${safeTenantId}/users?groupIds=${encodeURIComponent(safeGroupIds.join(','))}`,
      authHeader,
      `members of group(s) ${safeGroupIds.join(', ')}`,
    )

    const emails = (body.data?.users ?? [])
      .map((user) => user?.ssoUser?.email?.trim().toLowerCase())
      .filter((email): email is string => !!email)

    return [...new Set(emails)]
  }

  /**
   * A GET against CSTAR, mapping its failures onto the same exceptions the role and tenant
   * lookups above raise. Those two predate this helper and each inline their own copy; this
   * exists so the group lookups do not add two more.
   *
   * @param path Absolute request path, already encoded
   * @param authHeader JWT Authorization header to pass through to CSTAR
   * @param description What is being fetched, for log and error messages
   */
  private async cstarGet<T>(path: string, authHeader: string | undefined, description: string) {
    if (!this.baseUrl) {
      this.logger.error('CSTAR_API_URL is not configured')
      throw new InternalServerErrorException('CSTAR API is not configured')
    }

    const url = new URL(path, this.baseUrl).toString()

    let response: Response
    try {
      this.logger.debug(`Fetching ${description} from CSTAR: ${url}`)
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
      })
    } catch (error) {
      this.logger.error(
        `Failed to fetch ${description}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new InternalServerErrorException(`Failed to fetch ${description} from CSTAR`)
    }

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
        throw new UnauthorizedException(`Not authenticated with CSTAR: ${message}`)
      }
      // A 404 here is a tenant or group the caller cannot see, which is indistinguishable from
      // one that does not exist - both mean "not yours to read".
      if (response.status === 403 || response.status === 404) {
        throw new ForbiddenException(`Not authorized to read ${description}`)
      }

      this.logger.error(`CSTAR API error fetching ${description}: ${response.status} ${message}`)
      throw new InternalServerErrorException(`CSTAR API error: ${response.status} - ${message}`)
    }

    try {
      return (await response.json()) as T
    } catch {
      this.logger.error(`CSTAR returned an unparseable body for ${description}`)
      throw new InternalServerErrorException(`Failed to fetch ${description} from CSTAR`)
    }
  }
}
