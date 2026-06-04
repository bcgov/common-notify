import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WebhookConfig } from './entities/webhook-config.entity'
import { WebhookDeliveryLog } from './entities/webhook-delivery-log.entity'
import { WebhookConfigRepository } from './webhook.repository'
import { WebhookDeliveryLogRepository } from './webhook-delivery-log.repository'
import { WebhookService } from './webhook.service'
import { EncryptionService } from './encryption.service'
import { TenantsModule } from '../admin/tenants/tenants.module'

@Module({
  imports: [TypeOrmModule.forFeature([WebhookConfig, WebhookDeliveryLog]), TenantsModule],
  providers: [
    WebhookConfigRepository,
    WebhookDeliveryLogRepository,
    WebhookService,
    EncryptionService,
  ],
  exports: [WebhookService, WebhookConfigRepository, WebhookDeliveryLogRepository],
})
export class WebhookModule {}
