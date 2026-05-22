import { SetMetadata } from '@nestjs/common'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'

/**
 * Feature Flag decorator for feature gating API endpoints
 *
 * Controls access to endpoints based on feature flag status.
 * Works with the FeatureFlagGuard which checks if the feature is enabled
 * for the tenant (or globally if no tenant override exists).
 *
 * Usage:
 * @Post('send')
 * @FeatureFlag(FeatureFlagCode.SMS_NOTIFICATIONS)
 * async send(@GetTenant() tenant: Tenant) { ... }
 *
 * The guard will:
 * 1. Check for a tenant-specific override
 * 2. Fall back to global setting if no override exists
 * 3. Return 403 Forbidden if the feature is disabled
 */
export const FEATURE_FLAG_KEY = 'feature_flag_code'
export const FeatureFlag = (code: FeatureFlagCode) => SetMetadata(FEATURE_FLAG_KEY, code)
