import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'
import { ApiKeyTenantGuard } from './api-key-tenant.guard'

/**
 * NotifyServiceGuard
 *
 * Tenant resolution for Notify's own service-to-service routes. All of the behaviour
 * lives in {@link ApiKeyTenantGuard}; this adds nothing but the route description.
 *
 * Usage:
 * @UseGuards(NotifyServiceGuard)
 * async serviceEndpoint() { }
 */
@Injectable()
export class NotifyServiceGuard extends ApiKeyTenantGuard {
  protected readonly logger = new Logger(NotifyServiceGuard.name)

  constructor(
    @InjectRepository(ApiKeyConsumer)
    apiKeyConsumerRepository: Repository<ApiKeyConsumer>,
  ) {
    super(apiKeyConsumerRepository)
  }

  protected get routeDescription(): string {
    return 'Service-to-service request'
  }
}
