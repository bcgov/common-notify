import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { WebhookDeliveryLog } from './entities/webhook-delivery-log.entity'

@Injectable()
export class WebhookDeliveryLogRepository {
  constructor(
    @InjectRepository(WebhookDeliveryLog)
    private readonly repo: Repository<WebhookDeliveryLog>,
  ) {}

  logAttempt(data: Partial<WebhookDeliveryLog>): Promise<WebhookDeliveryLog> {
    return this.repo.save(this.repo.create(data))
  }
}
