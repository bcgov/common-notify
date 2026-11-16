import { useTenantFeatureAccess } from './useTenantFeatureAccess'
import type { TenantFeatureAccess } from './useTenantFeatureAccess'

export type BulkNotificationsAccess = TenantFeatureAccess

export function useBulkNotificationsAccess(): BulkNotificationsAccess {
  return useTenantFeatureAccess('bulk_notifications')
}
