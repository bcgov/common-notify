import { useTenantFeatureAccess } from './useTenantFeatureAccess'
import type { TenantFeatureAccess } from './useTenantFeatureAccess'

export type DashboardAccess = TenantFeatureAccess

export function useDashboardAccess(): DashboardAccess {
  return useTenantFeatureAccess('dashboard')
}
