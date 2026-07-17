import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Tenant } from '../../api/admin/tenants/entities/tenant.entity'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'

/**
 * GcNotifyServiceGuard
 *
 * Tenant resolution for GC Notify-compatible routes (GcNotifyController), mirroring
 * NotifyServiceGuard's Kong x-credential-identifier -> ApiKeyConsumer -> Tenant flow
 * (see notify-service.guard.ts). Tenants migrating off GC Notify are issued a key
 * Kong validates the same way it validates keys for /notifysimple today.
 *
 * Additionally validates the literal `Authorization: ApiKey-v1 {key}` header GC
 * Notify clients send (the real GC Notify auth scheme) and attaches the raw header
 * value as request.gcNotifyAuthHeader, so passthrough mode can still forward it
 * unmodified to the real GC Notify API.
 */
@Injectable()
export class GcNotifyServiceGuard implements CanActivate {
  private readonly logger = new Logger(GcNotifyServiceGuard.name)

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(ApiKeyConsumer)
    private apiKeyConsumerRepository: Repository<ApiKeyConsumer>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    request.gcNotifyAuthHeader = this.requireAuthHeader(request)

    const credentialIdentifier = request.headers['x-credential-identifier'] as string
    if (!credentialIdentifier) {
      this.logger.warn(
        'Request missing x-credential-identifier header. Kong did not authenticate the API key.',
      )
      throw new UnauthorizedException('API request must be authenticated with a valid API key')
    }

    let mapping: ApiKeyConsumer | null = null
    try {
      mapping = await this.apiKeyConsumerRepository.findOne({
        where: { credentialIdentifier },
        relations: ['tenant'],
      })
    } catch (error) {
      this.logger.error(
        `Failed to look up api_key_consumer for credential ${credentialIdentifier}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to validate request')
    }

    if (!mapping) {
      this.logger.warn(
        `No tenant binding found for credential identifier ${credentialIdentifier}. ` +
          `The API key must be bound to a tenant via POST /api/v1/service/api-key/bind`,
      )
      throw new NotFoundException(
        'This API key has not been associated with a tenant. ' +
          'Please call POST /api/v1/service/api-key/bind to complete setup.',
      )
    }

    const tenant = mapping.tenant
    if (!tenant || tenant.isDeleted) {
      this.logger.warn(
        `Tenant ${mapping.tenantId} for credential ${credentialIdentifier} not found or is deleted`,
      )
      throw new NotFoundException('Associated tenant not found or has been deactivated')
    }

    request.tenant = tenant
    request.tenantId = tenant.id
    request.tenantExternalId = tenant.externalId

    this.logger.debug(`✓ GC Notify request authorized. Tenant: "${tenant.name}" (${tenant.id})`)

    return true
  }

  private requireAuthHeader(req: { headers: Record<string, unknown> }): string {
    const authHeader = req.headers['authorization']
    if (typeof authHeader === 'string') {
      const trimmed = authHeader.trim()
      if (trimmed.startsWith('ApiKey-v1 ')) {
        const key = trimmed.substring('ApiKey-v1 '.length).trim()
        if (key) {
          return trimmed
        }
      }
    }
    throw new BadRequestException(
      'Authorization header is required with format: ApiKey-v1 {api-key}',
    )
  }
}
