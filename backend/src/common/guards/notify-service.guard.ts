import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { ClientTenantMappingService } from '../../api/admin/client-tenant-mappings/client-tenant-mapping.service'

/**
 * NotifyServiceGuard
 *
 * Guard for service-to-service API calls (no user authentication).
 *
 * Used for backend services calling notify API via Kong API gateway.
 * Kong gateway handles OAuth2 client credentials validation and returns
 * a JWT with the client ID in the azp claim from the apigw realm.
 *
 * Validation flow:
 * 1. Requires x-tenant-id header (must be supplied by calling service)
 * 2. Extracts JWT from Authorization Bearer header
 * 3. Decodes JWT manually (no signature validation - Kong gateway already validated)
 * 4. Validates issuer matches service realm (apigw, not standard/frontend)
 * 5. Extracts client ID from JWT azp claim
 * 6. Looks up tenant by external ID
 * 7. Verifies client_id + tenant_id mapping exists in database
 *
 * Attaches to request:
 * - request.tenant: The tenant entity
 * - request.clientId: The service client ID (azp claim)
 *
 * Error responses:
 * - 400: Missing x-tenant-id header
 * - 401: Missing/invalid authorization header, invalid issuer, or missing client ID
 * - 403: Client is not authorized to access tenant
 * - 404: Tenant not found
 *
 * Usage:
 * @UseGuards(NotifyServiceGuard)
 * async serviceEndpoint() { }
 */
@Injectable()
export class NotifyServiceGuard implements CanActivate {
  private readonly logger = new Logger(NotifyServiceGuard.name)
  private readonly keycloakIssuer: string

  constructor(
    private configService: ConfigService,
    private tenantsService: TenantsService,
    private clientTenantMappingService: ClientTenantMappingService,
  ) {
    this.keycloakIssuer = configService.getOrThrow('auth.apiGatewayKeycloakIssuer')
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // 1. Validate x-tenant-id header is present
    const xTenantId = request.headers['x-tenant-id'] as string
    if (!xTenantId) {
      throw new BadRequestException('x-tenant-id header is required for service-to-service calls')
    }

    // 2. Extract JWT from Authorization header
    const authHeader = request.headers.authorization as string
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header')
    }

    const token = authHeader.substring(7)

    // 3. Decode JWT manually (no signature validation - Kong gateway already validated)
    let payload: any
    try {
      payload = this.decodeJwt(token)
    } catch {
      this.logger.error('Failed to decode JWT')
      throw new UnauthorizedException('Invalid JWT format')
    }

    const clientId = payload.azp as string
    if (!clientId) {
      this.logger.warn('JWT missing required azp (client ID) claim')
      throw new UnauthorizedException('Client ID not found in JWT')
    }

    // 3b. Validate issuer (service requests must come from apigw realm)
    const issuer = payload.iss as string
    if (issuer !== this.keycloakIssuer) {
      this.logger.warn(`Issuer mismatch. Expected: ${this.keycloakIssuer}, Got: ${issuer}`)
      throw new UnauthorizedException('Invalid token issuer')
    }

    // 4. Look up tenant by external ID
    let tenant
    try {
      tenant = await this.tenantsService.findByExternalId(xTenantId)
    } catch {
      this.logger.error(`Failed to look up tenant by external ID ${xTenantId}`)
      throw new NotFoundException('Tenant not found')
    }

    if (!tenant) {
      this.logger.warn(`Tenant not found for external ID: ${xTenantId}`)
      throw new NotFoundException('Tenant not found')
    }

    // 5. Verify client_id + tenant_id mapping exists
    try {
      const mappedTenantIds = await this.clientTenantMappingService.findTenantsByClientId(clientId)
      if (!mappedTenantIds.includes(tenant.id)) {
        this.logger.warn(
          `Service client ${clientId} is not mapped to tenant ${tenant.id} (external ID: ${xTenantId})`,
        )
        throw new ForbiddenException(
          'Service client is not authorized to access this tenant. Please contact an administrator.',
        )
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error
      }
      this.logger.error(
        `Failed to verify service client mapping for ${clientId} to tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to verify client authorization')
    }

    // Attach context to request
    request.tenant = tenant
    request.clientId = clientId

    this.logger.debug(
      `Service-to-service request authorized. Client: ${clientId}, Tenant: ${tenant.name}`,
    )

    return true
  }

  /**
   * Decode JWT without signature validation
   * Format: header.payload.signature
   * We only need the payload (middle part)
   */
  private decodeJwt(token: string): any {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format: expected 3 parts separated by dots')
    }

    try {
      const decodedPayload = Buffer.from(parts[1], 'base64').toString('utf-8')
      return JSON.parse(decodedPayload)
    } catch {
      throw new Error('Failed to decode JWT payload')
    }
  }
}
