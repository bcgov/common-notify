import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CstarModule } from '../../services/cstar/cstar.module'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { SmsNumber } from './entities/sms-number.entity'
import { SmsNumberRequest } from './entities/sms-number-request.entity'
import { SmsNumberRequestHistory } from './entities/sms-number-request-history.entity'
import { TenantSmsNumber } from './entities/tenant-sms-number.entity'
import { SmsNumberRequestsController } from './sms-number-requests.controller'
import { SmsNumberRequestsService } from './sms-number-requests.service'
import { SmsNumbersAdminController } from './sms-numbers-admin.controller'
import { SmsNumbersService } from './sms-numbers.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SmsNumber,
      TenantSmsNumber,
      SmsNumberRequest,
      SmsNumberRequestHistory,
    ]),
    // For NotifyFrontendRoleGuard on the tenant's request endpoints.
    CstarModule,
    TenantsModule,
  ],
  providers: [SmsNumbersService, SmsNumberRequestsService],
  controllers: [SmsNumbersAdminController, SmsNumberRequestsController],
  exports: [SmsNumbersService],
})
export class SmsNumbersModule {}
