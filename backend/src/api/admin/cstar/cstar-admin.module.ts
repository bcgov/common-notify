import { Module } from '@nestjs/common'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { CstarModule } from '../../../services/cstar/cstar.module'
import { CstarAdminController } from './cstar-admin.controller'

@Module({
  imports: [CstarModule],
  controllers: [CstarAdminController],
  providers: [NotifyAdminGuard],
})
export class CstarAdminModule {}
