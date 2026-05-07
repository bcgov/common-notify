import type { AxiosError } from 'axios'
import { post, get, patch, generateApiParameters, STATUS_CODES } from '@/common/api'

export interface LinkClientToTenantsRequest {
  client_id: string
  client_secret: string
  tenant_ids: string[]
}

export interface ClientTenantMapping {
  id: string
  client_id: string
  tenant_id: string
  tenant_name: string
  is_active: boolean
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  is_deleted: boolean
}

export interface LinkClientToTenantsResponse {
  mappings: ClientTenantMapping[]
  message: string
  count: number
}

/**
 * Admin API for managing client-tenant mappings
 * Endpoints for linking API Gateway clients to CSTAR tenants
 */
export const adminApi = {
  /**
   * Link an API Gateway client to one or more CSTAR tenants
   * POST /api/v1/frontend/admin/clients/link-to-tenants
   *
   * Security:
   * - Client credentials are used only for one-time verification via OAuth2
   * - Client secret is never stored - only the mapping is persisted
   * - Requires NOTIFY_ADMIN role
   *
   * @param request Contains client_id, client_secret, and tenant_ids
   * @returns Confirmation with created mappings
   * @throws Error if client credentials are invalid or tenants don't exist
   */
  async linkClientToTenants(request: LinkClientToTenantsRequest) {
    try {
      const params = generateApiParameters('/api/v1/frontend/admin/clients/link-to-tenants')
      return await post<LinkClientToTenantsResponse>({
        ...params,
        data: request,
      })
    } catch (error) {
      const axiosError = error as AxiosError
      const responseData = (axiosError.response?.data as any) || {}

      if (axiosError.response?.status === STATUS_CODES.BadRequest) {
        const errorMessage = responseData.fieldErrors
          ? Object.entries(responseData.fieldErrors)
              .map(([field, errors]) => {
                const errorList = Array.isArray(errors) ? errors.join(', ') : errors
                return `${field}: ${errorList}`
              })
              .join('; ')
          : responseData.message || 'Invalid request'

        throw new Error(`Invalid client credentials or non-existent tenants: ${errorMessage}`)
      }
      if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
        throw new Error('You do not have permission to perform this action (NOTIFY_ADMIN required)')
      }
      throw new Error(
        `Failed to link client to tenants: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  },
}

export default adminApi

/**
 * Get all client-tenant mappings
 */
export async function getAllMappings() {
  try {
    const params = generateApiParameters('/api/v1/frontend/admin/clients/mappings')
    return await get<{ mappings: ClientTenantMapping[]; count: number }>(params)
  } catch (error) {
    throw new Error(
      `Failed to fetch client-tenant mappings: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

/**
 * Toggle the active status of a mapping
 */
export async function toggleMappingActiveStatus(id: string) {
  try {
    const params = generateApiParameters(
      `/api/v1/frontend/admin/clients/mappings/${id}/toggle-active`,
    )
    return await patch<{ mapping: ClientTenantMapping; message: string }>(params)
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    throw new Error(
      `Failed to toggle mapping status: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}
