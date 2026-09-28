import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'
import { ApiKeyTenantGuard } from './api-key-tenant.guard'

/**
 * GcNotifyServiceGuard
 *
 * Tenant resolution for GC Notify-compatible routes (GcNotifyController). Tenants
 * migrating off GC Notify are issued a key Kong validates the same way it validates
 * keys for /notifysimple, so the resolution itself is {@link ApiKeyTenantGuard}'s.
 *
 * What differs is the handshake: these clients send the literal
 * `Authorization: ApiKey-v1 {key}` header GC Notify taught them, and validating its
 * shape means a client that authenticates the way it always has gets a clear error
 * rather than a confusing one. The value itself is not retained — nothing forwards
 * upstream any more.
 */
@Injectable()
export class GcNotifyServiceGuard extends ApiKeyTenantGuard {
  protected readonly logger = new Logger(GcNotifyServiceGuard.name)

  constructor(
    @InjectRepository(ApiKeyConsumer)
    apiKeyConsumerRepository: Repository<ApiKeyConsumer>,
  ) {
    super(apiKeyConsumerRepository)
  }

  protected get routeDescription(): string {
    return 'GC Notify request'
  }

  protected beforeResolve(request: { headers: Record<string, unknown> }): void {
    const authHeader = request.headers['authorization']
    if (typeof authHeader === 'string') {
      const trimmed = authHeader.trim()
      if (trimmed.startsWith('ApiKey-v1 ') && trimmed.substring('ApiKey-v1 '.length).trim()) {
        return
      }
    }
    throw new BadRequestException(
      'Authorization header is required with format: ApiKey-v1 {api-key}',
    )
  }
}
