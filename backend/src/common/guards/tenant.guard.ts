import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { ClientTenantMappingService } from '../../api/admin/client-tenant-mappings/client-tenant-mapping.service'

/**
 * Guard that extracts tenant information from JWT or Kong headers
 *
 * Kong adds these headers after successful authentication:
 * - X-Consumer-Username: The authenticated consumer's username
 * - X-Consumer-ID: Kong's internal UUID for the consumer
 * - X-Credential-ID: The specific API key credential ID
 *
 * JWT authentication via Keycloak includes:
 * - Authorization: Bearer <JWT token>
 * - For service clients (client credentials flow): client_id in 'sub' or 'azp' claim
 * - For frontend users: user GUID in 'sub' claim
 *
 * Service clients are resolved to their accessible tenants via ClientTenantMapping.
 *
 * Attaches the tenant to request.tenant for use in route handlers.
 * Also attaches request.accessibleTenants array for multi-tenant scenarios.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name)

  constructor(
    private tenantsService: TenantsService,
    private clientTenantMappingService: ClientTenantMappingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // First, try to get tenant from Kong headers (if Kong is in use)
    const kongUsername = request.headers['x-consumer-username']
    const kongConsumerId = request.headers['x-consumer-id']

    this.logger.debug(
      `Incoming request: method=${request.method}, url=${request.url}, KongUsername=${kongUsername}, KongConsumerId=${kongConsumerId}`,
    )

    if (kongUsername) {
      this.logger.debug(
        `Kong authentication detected: username="${kongUsername}", consumerId="${kongConsumerId}"`,
      )

      // Try to find tenant by external ID (Kong consumer ID)
      let tenant = kongConsumerId
        ? await this.tenantsService.findByExternalId(kongConsumerId as string).catch(() => null)
        : null

      if (!tenant) {
        // If not found by external ID, try by name
        tenant = await this.tenantsService.findByName(kongUsername as string).catch(() => null)
      }

      if (!tenant) {
        this.logger.debug(
          `Tenant not found for Kong username: ${kongUsername}. Creating new tenant...`,
        )
        try {
          const createResult = await this.tenantsService.create({
            name: kongUsername as string,
            externalId: kongConsumerId as string,
          })
          tenant = createResult.tenant
          this.logger.debug(`Created new tenant: ${tenant.name} (Kong ID: ${kongConsumerId})`)
        } catch (error) {
          this.logger.error(
            `Failed to create tenant for Kong username ${kongUsername}: ${error.message}`,
          )
          throw new BadRequestException(
            `Failed to create tenant for Kong username: ${kongUsername}`,
          )
        }
      }

      this.logger.debug(
        `Tenant authenticated via Kong: ${tenant.name} (DB ID: ${tenant.id}, Kong ID: ${kongConsumerId})`,
      )

      request.tenant = tenant
      request.kongConsumerId = kongConsumerId
      return true
    }

    // If no Kong headers, try JWT from Authorization header
    const authHeader = request.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      this.logger.debug('JWT authentication detected')

      try {
        // Decode JWT manually - split by '.' and decode the payload (middle part)
        const parts = token.split('.')
        if (parts.length !== 3) {
          throw new Error('Invalid JWT format')
        }

        // Decode the payload (second part)
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))

        this.logger.debug(`JWT Payload: ${JSON.stringify(payload, null, 2)}`)

        // Check if this is a service client (has 'azp' or client_id claim from client credentials flow)
        const azp = payload.azp as string
        const clientIdClaim = payload.client_id as string

        if (azp || (clientIdClaim && this.isClientCredentialsFlow(payload))) {
          // This is a service client from client credentials flow
          const clientId = azp || clientIdClaim
          this.logger.debug(`Service client JWT detected. Client ID: ${clientId}`)

          // Look up accessible tenants via ClientTenantMapping
          const tenantIds = await this.clientTenantMappingService
            .findTenantsByClientId(clientId)
            .catch((error) => {
              this.logger.warn(
                `Error looking up ClientTenantMapping for ${clientId}: ${error.message}`,
              )
              return []
            })

          if (tenantIds.length === 0) {
            this.logger.warn(
              `Client ${clientId} has no mapped tenants in ClientTenantMapping table`,
            )
            throw new UnauthorizedException(
              `Client ${clientId} is not authorized to access any tenants. Please contact an administrator.`,
            )
          }

          this.logger.debug(
            `Client ${clientId} is authorized for ${tenantIds.length} tenant(s): ${tenantIds.join(', ')}`,
          )

          // Fetch the tenant objects
          const tenants = await Promise.all(
            tenantIds.map((id) => this.tenantsService.findOne(id)),
          ).catch((error) => {
            this.logger.error(`Failed to fetch tenant details: ${error.message}`)
            throw new UnauthorizedException('Failed to resolve authorized tenants')
          })

          // Use first tenant as primary (can be overridden by route-specific logic)
          request.tenant = tenants[0]
          request.accessibleTenants = tenants
          request.clientId = clientId
          return true
        }

        // This is a frontend user JWT (has user identifier in 'sub' claim)
        const sub = payload.sub as string
        if (!sub) {
          throw new Error('JWT missing required "sub" claim')
        }

        this.logger.debug(`JWT user identifier from 'sub' claim: ${sub}`)

        // Look up tenant by external ID (user identifier stored in externalId)
        let tenant = await this.tenantsService.findByExternalId(sub).catch(() => null)

        if (!tenant) {
          this.logger.debug(`Tenant not found for user identifier: ${sub}. Creating new tenant...`)
          try {
            const createResult = await this.tenantsService.create({
              name: sub,
              externalId: sub,
            })
            tenant = createResult.tenant
            this.logger.debug(`Created new tenant: ${tenant.name} (User ID: ${sub})`)
          } catch (error) {
            this.logger.error(
              `Failed to create tenant for user identifier ${sub}: ${error.message}`,
            )
            throw new UnauthorizedException(`Failed to create tenant for user identifier: ${sub}`)
          }
        }

        this.logger.debug(`Tenant authenticated via JWT: ${tenant.name} (User ID: ${sub})`)

        request.tenant = tenant
        request.userGuid = sub
        return true
      } catch (error) {
        this.logger.error(`Failed to process JWT: ${error.message}`)
        throw new UnauthorizedException(`Invalid JWT token: ${error.message}`)
      }
    }

    // No authentication found
    this.logger.error('No authentication headers found (Kong or JWT)')
    throw new BadRequestException(
      'Missing authentication. Provide either Kong consumer headers or JWT token.',
    )
  }

  /**
   * Check if JWT payload indicates a client credentials flow
   * Service accounts typically have 'client_roles' or specific realm_access structure
   */
  private isClientCredentialsFlow(payload: any): boolean {
    // Check for service account indicators
    const realmAccess = payload.realm_access as any
    const clientRoles = payload.client_roles as any

    // Client credentials tokens often have resource_access instead of direct client_roles
    const resourceAccess = payload.resource_access as any

    return (
      (realmAccess &&
        Array.isArray(realmAccess.roles) &&
        realmAccess.roles.includes('offline_access')) ||
      clientRoles !== undefined ||
      (resourceAccess && Object.keys(resourceAccess).length > 0)
    )
  }
}
