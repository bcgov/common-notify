import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FeatureFlagService } from '../../api/feature-flag/feature-flag.service'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { FEATURE_FLAG_KEY } from '../decorators/feature-flag.decorator'

/**
 * Feature Flag Guard
 *
 * Controls access to endpoints based on feature flag status.
 * Must be used with the @FeatureFlag() decorator.
 *
 * Checks feature flag status with the following precedence:
 * 1. Tenant-specific override (if tenantId provided)
 * 2. Global flag (tenantId = NULL)
 * 3. Default: false (feature disabled)
 *
 * Extracts tenant ID from (in order of precedence):
 * - x-tenant-id header (if present)
 * - request.tenant (set by AuthGuard)
 * - tenantId query parameter (if present)
 *
 * Returns 403 Forbidden if the feature is disabled for the tenant/globally.
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  private readonly logger = new Logger(FeatureFlagGuard.name)

  constructor(
    private reflector: Reflector,
    private featureFlagService: FeatureFlagService,
    private tenantsService: TenantsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get the feature flag code from decorator metadata
    const featureFlagCode = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // If no feature flag decorator is present, allow access
    if (!featureFlagCode) {
      return true
    }

    const request = context.switchToHttp().getRequest()

    // Try to extract tenant ID from request.tenant (set by AuthGuard), x-tenant-id header, or query param
    let tenantId =
      (request.tenant?.id ? String(request.tenant.id) : undefined) ||
      (request.headers['x-tenant-id'] as string) ||
      (request.query?.tenantId as string) ||
      undefined

    // If tenantId came from query param, it might be an external tenant ID
    // Try to resolve it to an internal UUID
    if (tenantId && !request.tenant) {
      try {
        const tenant = await this.tenantsService.findByExternalId(tenantId)
        if (tenant) {
          tenantId = tenant.id
        }
        // If not found as external ID, treat as-is (might be internal UUID)
      } catch (error) {
        this.logger.debug(`Could not resolve tenant by external ID "${tenantId}": ${error}`)
        // Continue with tenantId as-is
      }
    }

    this.logger.debug(
      `Checking feature flag "${featureFlagCode}" for tenant: ${tenantId || 'global'}`,
    )

    try {
      // Check if the feature is enabled
      const isEnabled = await this.featureFlagService.isEnabled(featureFlagCode, tenantId)

      if (!isEnabled) {
        this.logger.warn(
          `Access denied: Feature flag "${featureFlagCode}" is disabled${tenantId ? ` for tenant ${tenantId}` : ' globally'}`,
        )
        throw new ForbiddenException(
          `Feature "${featureFlagCode}" is not enabled${tenantId ? ' for your tenant' : ''}`,
        )
      }

      this.logger.debug(`Feature flag "${featureFlagCode}" is enabled`)
      return true
    } catch (error) {
      // If it's already a ForbiddenException, re-throw it
      if (error instanceof ForbiddenException) {
        throw error
      }

      // For other errors, log and deny access (safe default)
      this.logger.error(
        `Error checking feature flag "${featureFlagCode}" for tenant ${tenantId}`,
        error,
      )
      throw new ForbiddenException('Unable to verify feature flag status')
    }
  }
}
