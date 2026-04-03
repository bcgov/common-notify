import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ApiGatewayService } from './api-gateway.service'

@Module({
  imports: [ConfigModule],
  providers: [ApiGatewayService],
  exports: [ApiGatewayService],
})
export class ApiGatewayModule {}
