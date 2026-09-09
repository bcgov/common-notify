import { Module } from '@nestjs/common'
import { CstarApiClient } from './cstar-api.client'
import { CstarCacheStore } from './cstar-cache.store'

/**
 * CstarModule
 *
 * Provides CSTAR integration services for the application.
 * Currently exports CstarApiClient for RBAC role validation, backed by CstarCacheStore -
 * the Redis cache that keeps CSTAR lookups off the hot path across every pod.
 *
 * Usage in other modules:
 * ```typescript
 * @Module({
 *   imports: [CstarModule],
 *   providers: [MyService],
 * })
 * export class MyModule {}
 * ```
 */
@Module({
  providers: [CstarApiClient, CstarCacheStore],
  exports: [CstarApiClient, CstarCacheStore],
})
export class CstarModule {}
