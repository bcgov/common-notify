import axios from 'axios'

const API_BASE_URL = '/api/v1'

export interface GenerateApiKeyRequest {
  displayName: string
  description?: string
  rateLimitConfig?: Record<string, any>
}

export interface GeneratedApiKeyResponse {
  id: string
  tenantId: string
  displayName: string
  description?: string
  key: string
  createdAt: string
  createdBy: string
  rateLimitConfig?: Record<string, any>
}

export interface ApiKeyResponse {
  id: string
  tenantId: string
  displayName: string
  description?: string
  usageCount: number
  lastUsedAt?: string
  createdAt: string
  createdBy: string
  revokedAt?: string
  revokedBy?: string
  rateLimitConfig?: Record<string, any>
  isActive: boolean
}

export interface ApiKeysListResponse {
  data: ApiKeyResponse[]
  total: number
}

/**
 * API Key Service
 * Handles API calls for managing API keys
 */
export const apiKeyService = {
  /**
   * Generate a new API key for a tenant
   * @param tenantId - Tenant UUID
   * @param request - Key generation request
   * @returns Generated key response (includes key value - shown only once!)
   */
  async generateKey(
    tenantId: string,
    request: GenerateApiKeyRequest,
  ): Promise<GeneratedApiKeyResponse> {
    const response = await axios.post<GeneratedApiKeyResponse>(
      `${API_BASE_URL}/admin/tenants/${tenantId}/api-keys`,
      request,
    )
    return response.data
  },

  /**
   * List all API keys for a tenant
   * @param tenantId - Tenant UUID
   * @param activeOnly - Filter to active keys only (default: false)
   * @param skip - Skip N records for pagination (default: 0)
   * @param take - Take N records for pagination (default: 100)
   */
  async listKeys(
    tenantId: string,
    activeOnly = false,
    skip = 0,
    take = 100,
  ): Promise<ApiKeysListResponse> {
    const response = await axios.get<ApiKeysListResponse>(
      `${API_BASE_URL}/admin/tenants/${tenantId}/api-keys`,
      {
        params: {
          activeOnly,
          skip,
          take,
        },
      },
    )
    return response.data
  },

  /**
   * Get details of a specific API key
   * @param tenantId - Tenant UUID
   * @param keyId - API Key UUID
   */
  async getKey(tenantId: string, keyId: string): Promise<ApiKeyResponse> {
    const response = await axios.get<ApiKeyResponse>(
      `${API_BASE_URL}/admin/tenants/${tenantId}/api-keys/${keyId}`,
    )
    return response.data
  },

  /**
   * Revoke an API key
   * @param tenantId - Tenant UUID
   * @param keyId - API Key UUID
   */
  async revokeKey(tenantId: string, keyId: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/admin/tenants/${tenantId}/api-keys/${keyId}`)
  },
}
