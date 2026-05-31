import { generateApiParameters, get } from '@/common/api'
import type { CstarTenantsResponse } from '@/interfaces/CstarTenant'
import type { CstarRolesResponse } from '@/interfaces/CstarRoles'

declare global {
  interface Window {
    VITE_CSTAR_API_URL?: string
  }
}

const baseUrl = window.VITE_CSTAR_API_URL || import.meta.env.VITE_CSTAR_API_URL

/**
 * CSTAR API Client
 *
 * Provides methods for calling CSTAR APIs.
 * URL construction and business logic is handled in thunks.
 */
export const cstarApi = {
  async fetchUserTenants(ssoUserId: string): Promise<CstarTenantsResponse> {
    if (!baseUrl) {
      throw new Error('CSTAR API URL is not configured')
    }

    const parameters = generateApiParameters<never>(
      `${baseUrl}/api/v1/users/${ssoUserId}/tenants`,
      undefined,
      false,
      true, // CSTAR API requires JWT auth
    )

    return get(parameters)
  },

  async fetchUserRoles(url: string): Promise<CstarRolesResponse> {
    if (!baseUrl) {
      throw new Error('CSTAR API URL is not configured')
    }

    const parameters = generateApiParameters<never>(
      url,
      undefined,
      false,
      true, // CSTAR API requires JWT auth
    )

    return get(parameters)
  },

  getBaseUrl(): string {
    return baseUrl || ''
  },
}

export default cstarApi
