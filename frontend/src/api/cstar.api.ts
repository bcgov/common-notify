import axios from 'axios'
import type { CstarTenantsResponse } from '@/interfaces/CstarTenant'

declare global {
  interface Window {
    VITE_CSTAR_API_URL?: string
  }
}

const baseUrl = window.VITE_CSTAR_API_URL || import.meta.env.VITE_CSTAR_API_URL

export const cstarApi = {
  async fetchUserTenants(ssoUserId: string): Promise<CstarTenantsResponse> {
    if (!baseUrl) {
      throw new Error('CSTAR API URL is not configured')
    }

    try {
      const url = `${baseUrl}/api/v1/users/${ssoUserId}/tenants`
      const response = await axios.get<CstarTenantsResponse>(url)
      return response.data
    } catch (error) {
      throw new Error(
        `Failed to fetch CSTAR tenants: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  },
}

export default cstarApi
