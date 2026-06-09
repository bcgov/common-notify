import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ApiKeysService } from './api-keys.service'
import { ApiKeysController } from './api-keys.controller'
import { CstarModule } from '../../services/cstar/cstar.module'

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyConsumer, Tenant]), CstarModule],
  providers: [ApiKeysService],
  controllers: [ApiKeysController],
  exports: [TypeOrmModule, ApiKeysService],
})
export class ApiKeysModule {}
