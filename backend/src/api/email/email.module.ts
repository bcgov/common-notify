import { Module } from '@nestjs/common'
import { EmailService } from './email.service'
import { EmailController } from './email.controller'
import { TenantsModule } from '../../admin/tenants/tenants.module'
import { TenantGuard } from '../../common/guards/tenant.guard'

@Module({
  imports: [TenantsModule],
  controllers: [EmailController],
  providers: [EmailService, TenantGuard],
  exports: [EmailService],
})
export class EmailModule {}
