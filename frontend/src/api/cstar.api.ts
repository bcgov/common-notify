import { generateApiParameters, get } from '@/common/api'
import type { CstarTenantsResponse } from '@/interfaces/CstarTenant'
import type { BackendRolesResponse } from '@/interfaces/CstarRoles'

/**
 * CSTAR API Client (Frontend Proxy)
 *
 * Provides methods for calling CSTAR APIs through the backend.
 * Backend makes server-to-server calls to CSTAR to avoid CORS issues.
 *
 * API Routes:
 * - GET /api/v1/frontend/auth/tenants - Get user's CSTAR tenants
 * - GET /api/v1/frontend/auth/tenants/:tenantId/roles - Get user's roles in tenant
 */
export const cstarApi = {
  /**
   * Fetch user's tenants through backend proxy
   * Calls: GET /api/v1/frontend/auth/tenants
   *
   * @returns Promise with tenants array
   */
  async fetchUserTenants(): Promise<CstarTenantsResponse> {
    const parameters = generateApiParameters<never>(
      '/api/v1/frontend/auth/tenants',
      undefined,
      false,
      true, // Requires JWT auth
    )

    const response = (await get(parameters)) as { tenants?: any[] }
    return {
      data: {
        tenants: response.tenants || [],
      },
    }
  },

  /**
   * Fetch user's roles in a specific tenant through backend proxy
   * Calls: GET /api/v1/frontend/auth/tenants/:tenantId/roles
   *
   * @param tenantId The tenant ID to fetch roles for
   * @returns Promise with roles array
   */
  async fetchUserRoles(tenantId: string): Promise<BackendRolesResponse> {
    const parameters = generateApiParameters<never>(
      `/api/v1/frontend/auth/tenants/${tenantId}/roles`,
      undefined,
      false,
      true, // Requires JWT auth
    )

    const response = (await get(parameters)) as { roles?: string[] }
    return {
      data: {
        roles: response.roles || [],
      },
    }
  },
}

export default cstarApi
