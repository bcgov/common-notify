import { Module } from '@nestjs/common'
import { CstarApiClient } from './cstar-api.client'

/**
 * CstarModule
 *
 * Provides CSTAR integration services for the application.
 * Currently exports CstarApiClient for RBAC role validation.
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
  providers: [CstarApiClient],
  exports: [CstarApiClient],
})
export class CstarModule {}
