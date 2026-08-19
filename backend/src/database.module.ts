import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from './api/admin/tenants/entities/tenant.entity'
import { TenantStatusCode } from './api/admin/tenants/entities/tenant-status-code.entity'
import { NotifyUser } from './api/admin/users/entities/notify-user.entity'
import { Template } from './api/templates/entities/template.entity'
import { TemplateVersion } from './api/templates/entities/template-version.entity'
import { TemplateEngineCode } from './api/templates/entities/template-engine-code.entity'
import { NotificationRequest } from './api/notification/entities/notification-request.entity'
import { NotificationRequestDetail } from './api/notification/entities/notification-request-detail.entity'
import { NotificationStatusCode } from './api/notification/entities/notification-status-code.entity'
import { NotificationChannelCode } from './api/notification/entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from './api/notification/entities/notification-event-type-code.entity'
import { MimeTypeCode } from './api/notification/entities/mime-type-code.entity'
import { NotifyConfiguration } from './api/notification/entities/configuration.entity'
import { FeatureFlag } from './api/feature-flag/entities/feature-flag.entity'
import { FeatureFlagCode } from './api/feature-flag/entities/feature-flag-code.entity'
import { WebhookConfig } from './api/webhook/entities/webhook-config.entity'
import { WebhookDeliveryLog } from './api/webhook/entities/webhook-delivery-log.entity'
import { WebhookTypeCode } from './api/webhook/entities/webhook-type.entity'
import { ApiKeyConsumer } from './api/api-keys/entities/api-key-consumer.entity'
import { ApiKeyLimit } from './api/api-keys/entities/api-key-limit.entity'
import { ApiKeyUsage } from './api/api-keys/entities/api-key-usage.entity'
import { ApiKeyLimitAlert } from './api/api-keys/entities/api-key-limit-alert.entity'
import { ApiKeyLimitAlertLog } from './api/api-keys/entities/api-key-limit-alert-log.entity'
import { AttachmentEntity } from './api/attachment/entities/attachment.entity'
import { TenantSettings } from './api/tenant-settings/entities/tenant-settings.entity'
import { NotifyEvent } from './api/events/entities/event.entity'
import { EventChannelSetting } from './api/events/entities/event-channel-setting.entity'
import { ProvisionedPhoneNumber } from './api/events/entities/provisioned-phone-number.entity'
import { RecipientSafelist } from './api/safelist/entities/recipient-safelist.entity'

const dbHost = process.env.POSTGRES_HOST || 'localhost'
const dbUser = process.env.POSTGRES_USER || 'postgres'
const dbPassword = process.env.POSTGRES_PASSWORD || 'default'
const dbPort = parseInt(process.env.POSTGRES_PORT || '5432', 10)
const dbName = process.env.POSTGRES_DATABASE || 'postgres'
const dbSchema = process.env.POSTGRES_SCHEMA || 'notify'

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: dbHost,
      port: dbPort,
      username: dbUser,
      password: dbPassword,
      database: dbName,
      schema: dbSchema,
      entities: [
        Tenant,
        TenantStatusCode,
        NotifyUser,
        NotificationRequest,
        NotificationRequestDetail,
        NotificationStatusCode,
        NotificationChannelCode,
        NotificationEventTypeCode,
        MimeTypeCode,
        NotifyConfiguration,
        Template,
        TemplateVersion,
        TemplateEngineCode,
        FeatureFlag,
        FeatureFlagCode,
        WebhookConfig,
        WebhookDeliveryLog,
        WebhookTypeCode,
        ApiKeyConsumer,
        ApiKeyLimit,
        ApiKeyUsage,
        ApiKeyLimitAlert,
        ApiKeyLimitAlertLog,
        AttachmentEntity,
        TenantSettings,
        NotifyEvent,
        EventChannelSetting,
        ProvisionedPhoneNumber,
        RecipientSafelist,
      ],
      synchronize: false, // Use Flyway for migrations
      logging: process.env.NODE_ENV !== 'production' ? ['query', 'error'] : ['error'],
      poolErrorHandler: (error) => console.log('Pool error:', error),
      maxQueryExecutionTime: 1000,
    }),
    TypeOrmModule.forFeature([Tenant]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
