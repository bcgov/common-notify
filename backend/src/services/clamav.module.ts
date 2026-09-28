import { Module } from '@nestjs/common'
import { ClamavService } from './clamav.service'

@Module({
  providers: [ClamavService],
  exports: [ClamavService],
})
export class ClamavModule {}
