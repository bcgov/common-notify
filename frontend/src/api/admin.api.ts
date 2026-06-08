import type { AxiosError } from 'axios'
import { get, generateApiParameters } from '@/common/api'

export interface TenantReference {
  id: string
  name: string
}

/**
 * Admin API for managing tenants and API keys
 */
export const adminApi = {
  /**
   * Get all tenants in the notify database
   * GET /api/v1/admin/tenants
   *
   * Returns all tenants managed by the notify system.
   * Requires NOTIFY_ADMIN role.
   *
   * @returns Array of all notify database tenants (empty array on failure)
   */
  async getAllTenants() {
    try {
      const params = generateApiParameters('/api/v1/admin/tenants')
      return await get<TenantReference[]>(params)
    } catch (error) {
      // Silently fail - don't throw or redirect
      // If the user isn't admin, we just won't populate the dropdown
      console.warn(
        '[adminApi.getAllTenants] Failed to fetch tenants:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      return []
    }
  },
}

export default adminApi
