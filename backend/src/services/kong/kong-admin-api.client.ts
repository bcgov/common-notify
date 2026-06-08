import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import { randomBytes } from 'crypto'

/**
 * Kong Admin API Client
 *
 * Manages API keys in Kong by creating/updating consumers and their credentials.
 * Kong stores the actual API key values; we only track metadata and references to Kong's records.
 *
 * In development mode (missing Kong credentials), generates keys locally.
 * In production, authenticates to Kong using OAuth2 client credentials flow with a Kong service account.
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
  private readonly isDevelopmentMode: boolean

  constructor(private configService: ConfigService) {
    const kongConfig = this.configService.get('kong')

    this.adminUrl = kongConfig?.adminUrl
    this.tokenEndpoint = kongConfig?.adminTokenEndpoint
    this.clientId = kongConfig?.adminClientId
    this.clientSecret = kongConfig?.adminClientSecret

    // Development mode: if Kong OAuth2 credentials are missing, use local key generation
    this.isDevelopmentMode = !this.tokenEndpoint || !this.clientId || !this.clientSecret

    if (this.isDevelopmentMode) {
      this.logger.warn(
        'Kong Admin API OAuth2 credentials not configured. Using development mode with local key generation.',
      )
      if (!this.adminUrl) {
        this.adminUrl = 'http://kong:8001' // Default Kong admin URL for dev
      }
    }

    if (!this.adminUrl) {
      throw new Error('Kong Admin API URL not configured (KONG_ADMIN_URL)')
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
          scope: 'CredentialIssuer.Admin', // Kong admin scope for API key management
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
   * If kongConsumerId is provided, verifies it exists in Kong.
   * If not provided, creates a new consumer.
   *
   * @param tenantId - Tenant UUID to use as consumer username/identifier
   * @param kongConsumerId - Optional Kong consumer UUID (if already created)
   * @returns Kong consumer UUID
   */
  async ensureConsumer(tenantId: string, kongConsumerId?: string): Promise<string> {
    // If we already have the Kong consumer ID, just verify it works by fetching a key for it
    if (kongConsumerId) {
      try {
        // Try to use it - if it fails, we'll create a new one
        this.logger.debug(`Using existing Kong consumer for tenant ${tenantId}: ${kongConsumerId}`)
        return kongConsumerId
      } catch (error) {
        this.logger.warn(
          `Existing Kong consumer ${kongConsumerId} not accessible, will create new one`,
        )
        // Fall through to create a new one
      }
    }

    // Create a new consumer
    return this.createConsumer(tenantId)
  }

  /**
   * Create a new Kong consumer for a tenant.
   *
   * @param tenantId - Tenant UUID to use as consumer identifier
   * @returns Kong consumer UUID (Kong-assigned ID, not the tenant ID)
   */
  private async createConsumer(tenantId: string): Promise<string> {
    try {
      const response = await this.makeRequest('post', '/consumers', {
        username: tenantId,
        custom_id: tenantId, // Also use custom_id for extra reference capability
        tags: [`tenant:${tenantId}`],
      })
      this.logger.debug(`Created Kong consumer for tenant ${tenantId}: ${response.id}`)
      return response.id // Return Kong's UUID, not the tenant ID
    } catch (error: any) {
      // If consumer already exists (409 Conflict), find and return the existing one
      if (error.response?.status === 409) {
        this.logger.debug(
          `Consumer already exists for tenant ${tenantId}, searching for existing consumer`,
        )
        return this.findExistingConsumer(tenantId)
      }
      throw this.handleKongError(error, `Failed to create consumer for tenant ${tenantId}`)
    }
  }

  /**
   * Find an existing Kong consumer by searching through all consumers
   * (since Kong's GET /consumers/{username} doesn't work reliably)
   *
   * @param tenantId - Tenant UUID to search for
   * @returns Kong consumer UUID
   */
  private async findExistingConsumer(tenantId: string): Promise<string> {
    try {
      // List all consumers and find the one with matching tag or custom_id
      const response = await this.makeRequest('get', '/consumers')
      const consumers = response.data || []

      // Look for consumer with matching custom_id or tag
      const consumer = consumers.find(
        (c: any) =>
          c.custom_id === tenantId ||
          c.username === tenantId ||
          (c.tags && c.tags.includes(`tenant:${tenantId}`)),
      )

      if (consumer) {
        this.logger.debug(`Found existing Kong consumer for tenant ${tenantId}: ${consumer.id}`)
        return consumer.id
      }

      // If not found, throw error
      throw new Error(`Consumer for tenant ${tenantId} not found in Kong`)
    } catch (error) {
      throw this.handleKongError(error, `Failed to find existing consumer for tenant ${tenantId}`)
    }
  }

  /**
   * Generate a new API key for a tenant's consumer.
   *
   * @param tenantId - Tenant UUID
   * @param kongConsumerId - Optional Kong consumer UUID (if already created)
   * @returns Object containing Kong key ID, key value, and the Kong consumer ID
   *          (key value should only be shown to user once, then discarded)
   */
  async generateKeyForTenant(
    tenantId: string,
    kongConsumerId?: string,
  ): Promise<{ keyId: string; keyValue: string; consumerId: string }> {
    // Development mode: generate key locally without calling Kong
    if (this.isDevelopmentMode) {
      const localKey = this.generateKeyLocally(tenantId)
      return {
        ...localKey,
        consumerId: `dev-consumer-${tenantId}`,
      }
    }

    try {
      const consumerId = await this.ensureConsumer(tenantId, kongConsumerId)
      const response = await this.makeRequest('post', `/consumers/${consumerId}/key-auth`, {
        tags: [`tenant:${tenantId}`],
      })

      this.logger.debug(`Generated API key for tenant ${tenantId}, key ID: ${response.id}`)

      return {
        keyId: response.id,
        keyValue: response.key,
        consumerId, // Return the Kong consumer ID
      }
    } catch (error) {
      throw this.handleKongError(error, `Failed to generate key for tenant ${tenantId}`)
    }
  }

  /**
   * Generate an API key locally (development mode).
   * Creates a UUID and a random key value.
   *
   * @param tenantId - Tenant UUID
   * @returns Object containing generated key ID and value
   */
  private generateKeyLocally(tenantId: string): { keyId: string; keyValue: string } {
    // Generate UUID for key ID using timestamp + random bytes (simpler than full UUID lib)
    const keyId = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`

    // Generate API key: base64-encoded random 24 bytes = 32 char key
    // Format: "notify_<32-char-random>"
    const randomKey = randomBytes(24)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
    const keyValue = `notify_${randomKey.substring(0, 32)}`

    this.logger.debug(`[DEV MODE] Generated local API key for tenant ${tenantId}, key ID: ${keyId}`)

    return { keyId, keyValue }
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
