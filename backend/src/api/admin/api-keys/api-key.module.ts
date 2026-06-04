import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKey } from './entities/api-key.entity'
import { ApiKeyService } from './api-key.service'
import { ApiKeyController } from './api-key.controller'
import { KongAdminApiClient } from '../../../services/kong/kong-admin-api.client'

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  providers: [ApiKeyService, KongAdminApiClient],
  controllers: [ApiKeyController],
  exports: [ApiKeyService], // Export for other modules that need to track key usage
})
export class ApiKeyModule {}
