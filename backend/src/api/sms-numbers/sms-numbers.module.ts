import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CstarModule } from '../../services/cstar/cstar.module'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { TenantRequestsModule } from '../tenant-requests/tenant-requests.module'
import { SmsNumber } from './entities/sms-number.entity'
import { TenantSmsNumber } from './entities/tenant-sms-number.entity'
import { SmsNumberRequestHandler } from './sms-number-request.handler'
import { SmsNumberRequestsController } from './sms-number-requests.controller'
import { SmsNumbersAdminController } from './sms-numbers-admin.controller'
import { SmsNumbersService } from './sms-numbers.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([SmsNumber, TenantSmsNumber]),
    // Requests for a number go through the tenant request workflow, with SmsNumberRequestHandler.
    TenantRequestsModule,
    // For NotifyFrontendRoleGuard on the tenant's request endpoints.
    CstarModule,
    TenantsModule,
  ],
  providers: [SmsNumbersService, SmsNumberRequestHandler],
  controllers: [SmsNumbersAdminController, SmsNumberRequestsController],
  exports: [SmsNumbersService],
})
export class SmsNumbersModule {}
