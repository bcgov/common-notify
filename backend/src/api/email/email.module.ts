import { Module } from '@nestjs/common'
import { EmailService } from './email.service'
import { EmailController, ChesController } from './email.controller'
import { TenantsModule } from '../../admin/tenants/tenants.module'
import { TenantGuard } from '../../common/guards/tenant.guard'
import { JwtGuard } from '../../common/guards/jwt.guard'

@Module({
  imports: [TenantsModule],
  controllers: [EmailController, ChesController],
  providers: [EmailService, TenantGuard, JwtGuard],
  exports: [EmailService],
})
export class EmailModule {}
