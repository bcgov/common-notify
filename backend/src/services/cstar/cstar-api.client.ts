import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
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

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('cstar.baseUrl') || ''
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
  async getUserRoles(tenantId: string, ssoUserId: string, authHeader?: string): Promise<string[]> {
    if (!this.baseUrl) {
      this.logger.error('CSTAR_API_URL is not configured')
      throw new InternalServerErrorException('CSTAR API is not configured')
    }

    const url = `${this.baseUrl}/api/v1/tenants/${tenantId}/ssousers/${ssoUserId}/shared-service-roles`

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
      this.logger.debug(`Successfully fetched roles for user ${ssoUserId} in tenant ${tenantId}`, {
        roleCount: roleNames.length,
        roles: roleNames,
      })

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
  async getUserTenants(ssoUserId: string, authHeader?: string): Promise<any[]> {
    if (!this.baseUrl) {
      this.logger.error('CSTAR_API_URL is not configured')
      throw new InternalServerErrorException('CSTAR API is not configured')
    }

    const url = `${this.baseUrl}/api/v1/users/${ssoUserId}/tenants`

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
        {
          tenantCount: data.data.tenants.length,
        },
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
