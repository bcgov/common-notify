import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { KongService } from './kong.service'

@Module({
  imports: [ConfigModule],
  providers: [KongService],
  exports: [KongService],
})
export class KongModule {}
