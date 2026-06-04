import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

/**
 * Kong Admin API Client
 *
 * Manages API keys in Kong by creating/updating consumers and their credentials.
 * Kong stores the actual API key values; we only track metadata and references to Kong's records.
 *
 * Authenticates to Kong using OAuth2 client credentials flow with a Kong service account.
 */
@Injectable()
export class KongAdminApiClient {
  private readonly logger = new Logger(KongAdminApiClient.name)
  private client: AxiosInstance
  private accessToken: string | null = null
  private tokenExpiresAt: number = 0

  private readonly adminUrl: string
  private readonly tokenEndpoint: string
  private readonly clientId: string
  private readonly clientSecret: string

  constructor(private configService: ConfigService) {
    const kongConfig = this.configService.get('kong')

    this.adminUrl = kongConfig?.adminUrl
    this.tokenEndpoint = kongConfig?.adminTokenEndpoint
    this.clientId = kongConfig?.adminClientId
    this.clientSecret = kongConfig?.adminClientSecret

    if (!this.adminUrl) {
      throw new Error('Kong Admin API URL not configured (KONG_ADMIN_URL)')
    }
    if (!this.tokenEndpoint) {
      throw new Error('Kong Admin token endpoint not configured (KONG_ADMIN_TOKEN_ENDPOINT)')
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Kong service account not configured (KONG_ADMIN_CLIENT_ID, KONG_ADMIN_CLIENT_SECRET)')
    }

    this.client = axios.create({
      baseURL: this.adminUrl,
      timeout: 10000,
    })
  }

  /**
   * Get or refresh the access token using OAuth2 client credentials flow.
   * Tokens are cached until expiration.
   *
   * @returns Access token for Kong Admin API
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken
    }

    try {
      // Request new token using client credentials
      const response = await axios.post(
        this.tokenEndpoint,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: 'admin', // Kong admin scope
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 5000,
        },
      )

      this.accessToken = response.data.access_token
      // Token expires in N seconds; refresh at 80% of TTL to be safe
      const expiresIn = response.data.expires_in || 3600
      this.tokenExpiresAt = Date.now() + expiresIn * 0.8 * 1000

      this.logger.debug('Kong Admin API access token obtained')
      return this.accessToken
    } catch (error: any) {
      this.logger.error('Failed to obtain Kong Admin API access token', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      })
      throw new InternalServerErrorException(
        'Failed to authenticate with Kong Admin API. Check service account credentials.',
      )
    }
  }

  /**
   * Make a request to Kong Admin API with automatic token refresh.
   *
   * @param method HTTP method
   * @param path API path
   * @param data Request body (for POST/PUT)
   * @returns Response data
   */
  private async makeRequest(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    data?: any,
  ): Promise<any> {
    const token = await this.getAccessToken()

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }

    try {
      const response = await this.client[method](path, data, config)
      return response.data
    } catch (error: any) {
      // If 401, token might have expired; clear cache and retry once
      if (error.response?.status === 401) {
        this.logger.debug('Kong token expired, refreshing...')
        this.accessToken = null
        const newToken = await this.getAccessToken()
        config.headers.Authorization = `Bearer ${newToken}`
        return this.client[method](path, data, config).then((res) => res.data)
      }
      throw error
    }
  }

  /**
   * Get or create a Kong consumer for a tenant.
   * Uses tenant ID as the consumer username for consistency.
   *
   * @param tenantId - Tenant UUID to use as consumer identifier
   * @returns Kong consumer ID
   */
  async ensureConsumer(tenantId: string): Promise<string> {
    try {
      // Try to get existing consumer
      const response = await this.makeRequest('get', `/consumers/${tenantId}`)
      this.logger.debug(`Consumer already exists for tenant ${tenantId}: ${response.id}`)
      return response.id
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Consumer doesn't exist, create it
        return this.createConsumer(tenantId)
      }
      throw this.handleKongError(error, `Failed to get consumer for tenant ${tenantId}`)
    }
  }

  /**
   * Create a new Kong consumer for a tenant.
   *
   * @param tenantId - Tenant UUID to use as consumer identifier
   * @returns Kong consumer ID
   */
  private async createConsumer(tenantId: string): Promise<string> {
    try {
      const response = await this.makeRequest('post', '/consumers', {
        username: tenantId,
        tags: [`tenant:${tenantId}`],
      })
      this.logger.debug(`Created Kong consumer for tenant ${tenantId}: ${response.id}`)
      return response.id
    } catch (error) {
      throw this.handleKongError(error, `Failed to create consumer for tenant ${tenantId}`)
    }
  }

  /**
   * Generate a new API key for a tenant's consumer.
   *
   * @param tenantId - Tenant UUID
   * @returns Object containing Kong key ID and the actual API key value
   *          (key value should only be shown to user once, then discarded)
   */
  async generateKeyForTenant(tenantId: string): Promise<{ keyId: string; keyValue: string }> {
    try {
      const consumerId = await this.ensureConsumer(tenantId)
      const response = await this.makeRequest('post', `/consumers/${consumerId}/key-auth`, {
        tags: [`tenant:${tenantId}`],
      })

      this.logger.debug(`Generated API key for tenant ${tenantId}, key ID: ${response.id}`)

      return {
        keyId: response.id,
        keyValue: response.key,
      }
    } catch (error) {
      throw this.handleKongError(error, `Failed to generate key for tenant ${tenantId}`)
    }
  }

  /**
   * Revoke (delete) an API key from Kong.
   *
   * @param tenantId - Tenant UUID
   * @param keyId - Kong key ID (not the key value itself)
   */
  async revokeKey(tenantId: string, keyId: string): Promise<void> {
    try {
      const consumerId = await this.ensureConsumer(tenantId)
      await this.makeRequest('delete', `/consumers/${consumerId}/key-auth/${keyId}`)
      this.logger.debug(`Revoked key ${keyId} for tenant ${tenantId}`)
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Key already deleted or doesn't exist
        this.logger.warn(`Key ${keyId} not found in Kong for tenant ${tenantId}`)
        return
      }
      throw this.handleKongError(error, `Failed to revoke key ${keyId} for tenant ${tenantId}`)
    }
  }

  /**
   * List all API keys for a tenant's consumer.
   *
   * @param tenantId - Tenant UUID
   * @returns Array of key objects from Kong
   */
  async listKeysForTenant(
    tenantId: string,
  ): Promise<Array<{ id: string; key: string; tags: string[] }>> {
    try {
      const consumerId = await this.ensureConsumer(tenantId)
      const response = await this.makeRequest('get', `/consumers/${consumerId}/key-auth`)
      return response.data || []
    } catch (error) {
      throw this.handleKongError(error, `Failed to list keys for tenant ${tenantId}`)
    }
  }

  /**
   * Get details of a specific key from Kong.
   *
   * @param tenantId - Tenant UUID
   * @param keyId - Kong key ID
   * @returns Key details from Kong (without the actual key value for security)
   */
  async getKeyDetails(
    tenantId: string,
    keyId: string,
  ): Promise<{ id: string; created_at: number; tags: string[] }> {
    try {
      const consumerId = await this.ensureConsumer(tenantId)
      const response = await this.makeRequest('get', `/consumers/${consumerId}/key-auth/${keyId}`)
      return {
        id: response.id,
        created_at: response.created_at,
        tags: response.tags || [],
      }
    } catch (error) {
      throw this.handleKongError(error, `Failed to get key details for ${keyId}`)
    }
  }

  /**
   * Handle Kong API errors with consistent logging and user-friendly messages.
   *
   * @param error - The error object
   * @param context - Context for logging
   * @throws InternalServerErrorException
   */
  private handleKongError(error: any, context: string): never {
    this.logger.error(`Kong API Error: ${context}`, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    })

    // Don't expose Kong internals to client
    throw new InternalServerErrorException(
      'Failed to manage API keys. Please contact support if the problem persists.',
    )
  }
}


  /**
   * Get or create a Kong consumer for a tenant.
   * Uses tenant ID as the consumer username for consistency.
   *
   * @param tenantId - Tenant UUID to use as consumer identifier
   * @returns Kong consumer ID
   */
  async ensureConsumer(tenantId: string): Promise<string> {
    try {
      // Try to get existing consumer
      const response = await this.client.get(`/consumers/${tenantId}`)
      this.logger.debug(`Consumer already exists for tenant ${tenantId}: ${response.data.id}`)
      return response.data.id
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Consumer doesn't exist, create it
        return this.createConsumer(tenantId)
      }
      throw this.handleKongError(error, `Failed to get consumer for tenant ${tenantId}`)
    }
  }

  /**
   * Create a new Kong consumer for a tenant.
   *
   * @param tenantId - Tenant UUID to use as consumer identifier
   * @returns Kong consumer ID
   */
  private async createConsumer(tenantId: string): Promise<string> {
    try {
      const response = await this.client.post('/consumers', {
        username: tenantId,
        tags: [`tenant:${tenantId}`],
      })
      this.logger.debug(`Created Kong consumer for tenant ${tenantId}: ${response.data.id}`)
      return response.data.id
    } catch (error) {
      throw this.handleKongError(error, `Failed to create consumer for tenant ${tenantId}`)
    }
  }

  /**
   * Generate a new API key for a tenant's consumer.
   *
   * @param tenantId - Tenant UUID
   * @returns Object containing Kong key ID and the actual API key value
   *          (key value should only be shown to user once, then discarded)
   */
  async generateKeyForTenant(tenantId: string): Promise<{ keyId: string; keyValue: string }> {
    try {
      const consumerId = await this.ensureConsumer(tenantId)
      const response = await this.client.post(`/consumers/${consumerId}/key-auth`, {
        tags: [`tenant:${tenantId}`],
      })

      this.logger.debug(`Generated API key for tenant ${tenantId}, key ID: ${response.data.id}`)

      return {
        keyId: response.data.id,
        keyValue: response.data.key,
      }
    } catch (error) {
      throw this.handleKongError(error, `Failed to generate key for tenant ${tenantId}`)
    }
  }

  /**
   * Revoke (delete) an API key from Kong.
   *
   * @param tenantId - Tenant UUID
   * @param keyId - Kong key ID (not the key value itself)
   */
  async revokeKey(tenantId: string, keyId: string): Promise<void> {
    try {
      const consumerId = await this.ensureConsumer(tenantId)
      await this.client.delete(`/consumers/${consumerId}/key-auth/${keyId}`)
      this.logger.debug(`Revoked key ${keyId} for tenant ${tenantId}`)
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Key already deleted or doesn't exist
        this.logger.warn(`Key ${keyId} not found in Kong for tenant ${tenantId}`)
        return
      }
      throw this.handleKongError(error, `Failed to revoke key ${keyId} for tenant ${tenantId}`)
    }
  }

  /**
   * List all API keys for a tenant's consumer.
   *
   * @param tenantId - Tenant UUID
   * @returns Array of key objects from Kong
   */
  async listKeysForTenant(
    tenantId: string,
  ): Promise<Array<{ id: string; key: string; tags: string[] }>> {
    try {
      const consumerId = await this.ensureConsumer(tenantId)
      const response = await this.client.get(`/consumers/${consumerId}/key-auth`)
      return response.data.data || []
    } catch (error) {
      throw this.handleKongError(error, `Failed to list keys for tenant ${tenantId}`)
    }
  }

  /**
   * Get details of a specific key from Kong.
   *
   * @param tenantId - Tenant UUID
   * @param keyId - Kong key ID
   * @returns Key details from Kong (without the actual key value for security)
   */
  async getKeyDetails(
    tenantId: string,
    keyId: string,
  ): Promise<{ id: string; created_at: number; tags: string[] }> {
    try {
      const consumerId = await this.ensureConsumer(tenantId)
      const response = await this.client.get(`/consumers/${consumerId}/key-auth/${keyId}`)
      return {
        id: response.data.id,
        created_at: response.data.created_at,
        tags: response.data.tags || [],
      }
    } catch (error) {
      throw this.handleKongError(error, `Failed to get key details for ${keyId}`)
    }
  }

  /**
   * Handle Kong API errors with consistent logging and user-friendly messages.
   *
   * @param error - The error object
   * @param context - Context for logging
   * @throws InternalServerErrorException
   */
  private handleKongError(error: any, context: string): never {
    this.logger.error(`Kong API Error: ${context}`, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    })

    // Don't expose Kong internals to client
    throw new InternalServerErrorException(
      'Failed to manage API keys. Please contact support if the problem persists.',
    )
  }
}
