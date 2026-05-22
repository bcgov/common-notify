/**
 * Feature Flag Interface
 *
 * Represents a feature flag instance in the system.
 * Feature flags can be global (tenantId = null) or tenant-specific.
 */
export interface FeatureFlagCode {
  code: string
  displayName: string
  description?: string
  createdAt: string
  createdBy?: string
  updatedAt: string
  updatedBy?: string
}

export interface FeatureFlag {
  id: string
  code: string
  flagCode?: FeatureFlagCode
  enabled: boolean
  tenantId: string | null
  createdAt: string
  updatedAt: string
}
