import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CstarCacheStore } from './cstar-cache.store'
import type {
  CstarGroupDetailDto,
  CstarGroupDto,
  CstarGroupMemberDto,
  CstarGroupRolesUpdate,
  CstarGroupSharedServiceDto,
  CstarGroupUserDto,
  CstarGroupsResponseDto,
  CstarRolesResponseDto,
  CstarSsoSearchUserDto,
  CstarSsoUserDto,
  CstarTenantRoleDto,
  CstarTenantsResponseDto,
  CstarTenantUserDto,
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

  private readonly tokenUrl: string
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly scope?: string
  private accessToken: string | null = null
  private tokenExpiresAt = 0

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheStore: CstarCacheStore,
  ) {
    this.baseUrl = this.configService.get<string>('cstar.baseUrl') || ''
    this.tokenUrl = this.configService.get<string>('cstar.tokenUrl') || ''
    this.clientId = this.configService.get<string>('cstar.clientId') || ''
    this.clientSecret = this.configService.get<string>('cstar.clientSecret') || ''
    this.scope = this.configService.get<string>('cstar.scope') || undefined
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
    if (pending !== undefined) {
      return pending
    }

    const cached = await readCache()
    if (cached !== null) {
      return cached
    }

    // Re-check: the read is asynchronous, so two callers can both pass the check above
    // before either registers, and would each then call CSTAR.
    const started = inFlight.get(key)
    if (started !== undefined) {
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
   * notification to those groups. Authenticated as Notify's CSTAR service account, so it
   * works with no user present.
   *
   * One call per group: GET groups/{groupId}/users is the only member lookup CSTAR accepts
   * a service account token on. The tenant users endpoint filtered by `groupIds` would take
   * them all at once, but only with a user token.
   *
   * Members without an email are dropped rather than returned as blanks, and addresses are
   * de-duplicated: one person in two of an event's groups should be mailed once.
   *
   * @param tenantId The CSTAR tenant ID (notify's tenant.externalId)
   * @param groupIds The CSTAR group IDs whose members to resolve
   */
  async getGroupMemberEmailsAsServiceAccount(
    tenantId: string,
    groupIds: string[],
  ): Promise<string[]> {
    if (groupIds.length === 0) {
      return []
    }

    // Fetch the token before fanning out, or a cold cache would request one per group.
    await this.getServiceAccountAuthHeader()
    const groups = await Promise.all(
      groupIds.map((groupId) => this.getGroupMembersAsServiceAccount(tenantId, groupId)),
    )

    const emails = groups
      .flat()
      .map((member) => member?.email?.trim().toLowerCase())
      .filter((email): email is string => !!email)

    return [...new Set(emails)]
  }

  /**
   * The users of a CSTAR tenant.
   *
   * @param tenantId The CSTAR tenant ID
   * @param authHeader JWT Authorization header to pass through to CSTAR
   */
  async getTenantUsers(tenantId: string, authHeader?: string): Promise<CstarTenantUserDto[]> {
    const safeTenantId = this.safeSegment(tenantId, 'tenantId')
    const body = await this.cstarGet<{ data?: { users?: CstarTenantUserDto[] } }>(
      `/api/v1/tenants/${safeTenantId}/users`,
      authHeader,
      `users of tenant ${tenantId}`,
    )
    return body.data?.users ?? []
  }

  /**
   * One user of a CSTAR tenant.
   *
   * @param expand Comma-separated relations to include: groups, roles, sharedServices
   */
  async getTenantUser(
    tenantId: string,
    tenantUserId: string,
    expand: string | undefined,
    authHeader?: string,
  ): Promise<CstarTenantUserDto> {
    const safeTenantId = this.safeSegment(tenantId, 'tenantId')
    const safeTenantUserId = this.safeSegment(tenantUserId, 'tenantUserId')
    const body = await this.cstarGet<{ data: { tenantUser: CstarTenantUserDto } }>(
      `/api/v1/tenants/${safeTenantId}/users/${safeTenantUserId}${this.queryString({ expand })}`,
      authHeader,
      `tenant user ${tenantUserId}`,
    )
    return body.data.tenantUser
  }

  /**
   * Add a user to a CSTAR tenant. With Notify's shared service token CSTAR always gives the
   * user the SERVICE_USER role, and rejects requests that also send roles or groups.
   */
  async addTenantUser(
    tenantId: string,
    user: CstarSsoUserDto,
    authHeader?: string,
  ): Promise<CstarTenantUserDto> {
    const safeTenantId = this.safeSegment(tenantId, 'tenantId')
    const body = await this.cstarRequest<{ data: { user: CstarTenantUserDto } }>(
      'POST',
      `/api/v1/tenants/${safeTenantId}/users`,
      authHeader,
      `user for tenant ${tenantId}`,
      { user },
    )
    return body.data.user
  }

  /**
   * Remove a user from a CSTAR tenant. With Notify's shared service token CSTAR only allows
   * removing users whose only role is SERVICE_USER.
   */
  async removeTenantUser(
    tenantId: string,
    tenantUserId: string,
    authHeader?: string,
  ): Promise<void> {
    const safeTenantId = this.safeSegment(tenantId, 'tenantId')
    const safeTenantUserId = this.safeSegment(tenantUserId, 'tenantUserId')
    await this.cstarRequest<void>(
      'DELETE',
      `/api/v1/tenants/${safeTenantId}/users/${safeTenantUserId}`,
      authHeader,
      `tenant user ${tenantUserId}`,
    )
  }

  /** The tenant roles held by one user of a CSTAR tenant. */
  async getTenantUserRoles(
    tenantId: string,
    tenantUserId: string,
    authHeader?: string,
  ): Promise<CstarTenantRoleDto[]> {
    const safeTenantId = this.safeSegment(tenantId, 'tenantId')
    const safeTenantUserId = this.safeSegment(tenantUserId, 'tenantUserId')
    const body = await this.cstarGet<{ data?: { roles?: CstarTenantRoleDto[] } }>(
      `/api/v1/tenants/${safeTenantId}/users/${safeTenantUserId}/roles`,
      authHeader,
      `roles of tenant user ${tenantUserId}`,
    )
    return body.data?.roles ?? []
  }

  /**
   * Search BC Gov SSO for IDIR users. With Notify's shared service token CSTAR requires
   * tenantId among the params.
   */
  async searchIdirUsers(
    params: Record<string, string | undefined>,
    authHeader?: string,
  ): Promise<CstarSsoSearchUserDto[]> {
    const body = await this.cstarGet<{ data?: CstarSsoSearchUserDto[] }>(
      `/api/v1/users/bcgovssousers/idir/search${this.queryString(params)}`,
      authHeader,
      'IDIR user search',
    )
    return body.data ?? []
  }

  /**
   * Search BC Gov SSO for Business BCeID users. With Notify's shared service token CSTAR
   * requires tenantId among the params.
   */
  async searchBceidUsers(
    params: Record<string, string | undefined>,
    authHeader?: string,
  ): Promise<CstarSsoSearchUserDto[]> {
    const body = await this.cstarGet<{ data?: CstarSsoSearchUserDto[] }>(
      `/api/v1/users/bcgovssousers/bceid/search${this.queryString(params)}`,
      authHeader,
      'BCeID user search',
    )
    return body.data ?? []
  }

  /**
   * getTenantGroups, authenticated as Notify's CSTAR service account rather than a user, for
   * work that runs with no user present.
   */
  async getTenantGroupsAsServiceAccount(tenantId: string): Promise<CstarGroupDto[]> {
    return this.getTenantGroups(tenantId, await this.getServiceAccountAuthHeader())
  }

  /**
   * The members of one CSTAR group, authenticated as Notify's CSTAR service account. CSTAR
   * accepts only service account tokens on this route; user tokens get a 403.
   */
  async getGroupMembersAsServiceAccount(
    tenantId: string,
    groupId: string,
  ): Promise<CstarGroupMemberDto[]> {
    const safeTenantId = this.safeSegment(tenantId, 'tenantId')
    const safeGroupId = this.safeSegment(groupId, 'groupId')
    const body = await this.cstarGet<{ data?: { users?: CstarGroupMemberDto[] } }>(
      `/api/v1/tenants/${safeTenantId}/groups/${safeGroupId}/users`,
      await this.getServiceAccountAuthHeader(),
      `members of group ${groupId}`,
    )
    return body.data?.users ?? []
  }

  /**
   * One CSTAR group with its members. Always expands groupUsers: each member's id is the
   * groupUserId that removing them from the group needs.
   */
  async getGroup(
    tenantId: string,
    groupId: string,
    authHeader?: string,
  ): Promise<CstarGroupDetailDto> {
    const body = await this.cstarGet<{ data: { group: CstarGroupDetailDto } }>(
      `${this.groupPath(tenantId, groupId)}?expand=groupUsers`,
      authHeader,
      `group ${groupId}`,
    )
    return body.data.group
  }

  /** Create a group in a CSTAR tenant. CSTAR returns 409 for a name already in use. */
  async createGroup(
    tenantId: string,
    group: { name: string; description?: string },
    authHeader?: string,
  ): Promise<CstarGroupDto> {
    const safeTenantId = this.safeSegment(tenantId, 'tenantId')
    const body = await this.cstarRequest<{ data: { group: CstarGroupDto } }>(
      'POST',
      `/api/v1/tenants/${safeTenantId}/groups`,
      authHeader,
      `group for tenant ${tenantId}`,
      group,
    )
    return body.data.group
  }

  /** Rename a group or change its description. */
  async updateGroup(
    tenantId: string,
    groupId: string,
    group: { name?: string; description?: string },
    authHeader?: string,
  ): Promise<CstarGroupDto> {
    const body = await this.cstarRequest<{ data: { group: CstarGroupDto } }>(
      'PUT',
      this.groupPath(tenantId, groupId),
      authHeader,
      `group ${groupId}`,
      group,
    )
    return body.data.group
  }

  /**
   * Add a user to a group. With Notify's shared service token, a group that also grants roles
   * in other services needs those services listed in confirmOtherServices, or CSTAR returns 403
   * OTHER_SERVICES_NOT_CONFIRMED.
   */
  async addGroupUser(
    tenantId: string,
    groupId: string,
    user: CstarSsoUserDto,
    confirmOtherServices: string[] | undefined,
    authHeader?: string,
  ): Promise<CstarGroupUserDto> {
    const body = await this.cstarRequest<{ data: { groupUser: CstarGroupUserDto } }>(
      'POST',
      `${this.groupPath(tenantId, groupId)}/users`,
      authHeader,
      `user for group ${groupId}`,
      { user, ...(confirmOtherServices ? { confirmOtherServices } : {}) },
    )
    return body.data.groupUser
  }

  /** Remove a user from a group, by the groupUserId from getGroup. */
  async removeGroupUser(
    tenantId: string,
    groupId: string,
    groupUserId: string,
    authHeader?: string,
  ): Promise<void> {
    const safeGroupUserId = this.safeSegment(groupUserId, 'groupUserId')
    await this.cstarRequest<void>(
      'DELETE',
      `${this.groupPath(tenantId, groupId)}/users/${safeGroupUserId}`,
      authHeader,
      `group user ${groupUserId}`,
    )
  }

  /** The shared services a group's tenant uses, each with the roles the group grants. */
  async getGroupRoles(
    tenantId: string,
    groupId: string,
    authHeader?: string,
  ): Promise<CstarGroupSharedServiceDto[]> {
    const body = await this.cstarGet<{ data?: { sharedServices?: CstarGroupSharedServiceDto[] } }>(
      `${this.groupPath(tenantId, groupId)}/shared-services/shared-service-roles`,
      authHeader,
      `roles of group ${groupId}`,
    )
    return body.data?.sharedServices ?? []
  }

  /**
   * Switch a group's shared service roles on or off. With Notify's shared service token CSTAR
   * only lets Notify's own roles be changed.
   */
  async updateGroupRoles(
    tenantId: string,
    groupId: string,
    update: CstarGroupRolesUpdate,
    authHeader?: string,
  ): Promise<CstarGroupSharedServiceDto[]> {
    const body = await this.cstarRequest<{
      data?: { sharedServices?: CstarGroupSharedServiceDto[] }
    }>(
      'PUT',
      `${this.groupPath(tenantId, groupId)}/shared-services/shared-service-roles`,
      authHeader,
      `roles of group ${groupId}`,
      update,
    )
    return body.data?.sharedServices ?? []
  }

  private groupPath(tenantId: string, groupId: string): string {
    const safeTenantId = this.safeSegment(tenantId, 'tenantId')
    const safeGroupId = this.safeSegment(groupId, 'groupId')
    return `/api/v1/tenants/${safeTenantId}/groups/${safeGroupId}`
  }

  private safeSegment(value: string, field: string): string {
    this.requireIdentifier(value, field)
    return encodeURIComponent(this.validatePathSegment(value, field))
  }

  /** `?a=1&b=2` from the params that have a value, or '' when none do. */
  private queryString(params: Record<string, string | undefined>): string {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value)
    }
    const encoded = query.toString()
    return encoded ? `?${encoded}` : ''
  }

  /**
   * A Bearer header for Notify's CSTAR service account, reusing the cached token until 80% of
   * its TTL has elapsed so a token about to expire is not sent on a slow request.
   */
  private async getServiceAccountAuthHeader(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return `Bearer ${this.accessToken}`
    }

    if (!this.tokenUrl || !this.clientId || !this.clientSecret) {
      throw new ServiceUnavailableException(
        'CSTAR service account is not configured. ' +
          'Set CSTAR_TOKEN_URL, CSTAR_CLIENT_ID and CSTAR_CLIENT_SECRET.',
      )
    }

    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })
    if (this.scope) {
      form.set('scope', this.scope)
    }

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) {
        throw new Error(`token endpoint returned ${response.status}`)
      }
      const data = (await response.json()) as { access_token: string; expires_in?: number }

      this.accessToken = data.access_token
      const expiresIn = Number(data.expires_in) || 300
      this.tokenExpiresAt = Date.now() + expiresIn * 0.8 * 1000

      this.logger.debug('Obtained CSTAR service account access token')
      return `Bearer ${this.accessToken}`
    } catch (error) {
      this.logger.error(
        `Failed to obtain CSTAR service account token: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new ServiceUnavailableException(
        'Could not authenticate with CSTAR. Check the CSTAR service account credentials.',
      )
    }
  }

  private cstarGet<T>(path: string, authHeader: string | undefined, description: string) {
    return this.cstarRequest<T>('GET', path, authHeader, description)
  }

  /**
   * A request to CSTAR, mapping its failures onto the same exceptions the role and tenant
   * lookups above raise. Those two predate this helper and each inline their own copy; this
   * exists so the other lookups do not add more.
   *
   * @param path Absolute request path, already encoded
   * @param authHeader JWT Authorization header to pass through to CSTAR
   * @param description What is being fetched or changed, for log and error messages
   * @param body JSON request body, for writes
   */
  private async cstarRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    authHeader: string | undefined,
    description: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.baseUrl) {
      this.logger.error('CSTAR_API_URL is not configured')
      throw new InternalServerErrorException('CSTAR API is not configured')
    }

    const url = new URL(path, this.baseUrl).toString()

    let response: Response
    try {
      this.logger.debug(`${method} ${description} on CSTAR: ${url}`)
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (error) {
      this.logger.error(
        `Failed to ${method} ${description}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new InternalServerErrorException(`Failed to ${method} ${description} on CSTAR`)
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

      // Logged before mapping: the read branch below replaces CSTAR's reason with a generic one.
      this.logger.debug(
        `CSTAR returned ${response.status} for ${method} ${description}: ${message}`,
      )

      if (response.status === 401) {
        throw new UnauthorizedException(`Not authenticated with CSTAR: ${message}`)
      }
      // A 404 on a read is a tenant or group the caller cannot see, which is indistinguishable
      // from one that does not exist - both mean "not yours to read".
      if (method === 'GET' && (response.status === 403 || response.status === 404)) {
        throw new ForbiddenException(`Not authorized to read ${description}`)
      }
      // On the rest CSTAR's reason is passed through, so an admin can see why a change was
      // refused - e.g. removing a user who holds more than the SERVICE_USER role.
      if (response.status === 400) throw new BadRequestException(message)
      if (response.status === 403) throw new ForbiddenException(message)
      if (response.status === 404) throw new NotFoundException(message)
      if (response.status === 409) throw new ConflictException(message)

      this.logger.error(`CSTAR API error on ${description}: ${response.status} ${message}`)
      throw new InternalServerErrorException(`CSTAR API error: ${response.status} - ${message}`)
    }

    if (response.status === 204) {
      return undefined as T
    }

    try {
      return (await response.json()) as T
    } catch {
      this.logger.error(`CSTAR returned an unparseable body for ${description}`)
      throw new InternalServerErrorException(`Failed to ${method} ${description} on CSTAR`)
    }
  }
}
