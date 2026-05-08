import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from './api/admin/tenants/entities/tenant.entity'
import { TenantStatusCode } from './api/admin/tenants/entities/tenant-status-code.entity'
import { Template } from './api/templates/entities/template.entity'
import { TemplateVersion } from './api/templates/entities/template-version.entity'
import { TemplateEngineCode } from './api/templates/entities/template-engine-code.entity'
import { NotificationRequest } from './api/notification/entities/notification-request.entity'
import { NotificationStatusCode } from './api/notification/entities/notification-status-code.entity'
import { NotificationChannelCode } from './api/notification/entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from './api/notification/entities/notification-event-type-code.entity'

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
        NotificationRequest,
        NotificationStatusCode,
        NotificationChannelCode,
        NotificationEventTypeCode,
        Template,
        TemplateVersion,
        TemplateEngineCode,
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
