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

/**
 * One change to a feature flag: its creation or an enable/disable.
 */
export interface FeatureFlagHistoryEntry {
  id: string
  featureFlagId: string
  code: string
  /** Null for a global flag. */
  tenantId: string | null
  enabled: boolean
  /** Stable user identifier (for IDIR, an opaque `<guid>@azureidir`). */
  createdBy: string
  /** Display name at the time of the change, when the token carried one. */
  createdByName: string | null
  createdAt: string
}
