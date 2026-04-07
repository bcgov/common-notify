import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * Kong API Response Types
 */
interface KongConsumer {
  id: string
  username: string
  custom_id?: string
  created_at: number
}

interface KongCredential {
  id: string
  consumer_id: string
  key: string
  created_at: number
}

interface KongApiKeyResponse {
  key: string
  consumer_id: string
  created_at: number
}

interface KongListResponse<T> {
  data: T[]
  offset?: string
}

/**
 * Kong Admin API Service
 * Handles all interactions with Kong gateway for consumer and credential management
 */
@Injectable()
export class KongService {
  private readonly logger = new Logger(KongService.name)
  private readonly kongAdminUrl: string

  constructor(private configService: ConfigService) {
    this.kongAdminUrl = this.configService.get('KONG_ADMIN_URL') || 'http://kong:8001'
  }

  /**
   * Create a Kong consumer (tenant)
   * @param username Unique identifier for the tenant
   * @param customId Custom metadata for the tenant
   * @returns Consumer object with id, username, etc.
   */
  async createConsumer(username: string, customId?: string): Promise<KongConsumer> {
    try {
      const data = new URLSearchParams()
      data.append('username', username)
      if (customId) {
        data.append('custom_id', customId)
      }

      const response = await fetch(`${this.kongAdminUrl}/consumers`, {
        method: 'POST',
        body: data,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      if (!response.ok) {
        const error = await response.text()
        this.logger.error(`Failed to create consumer: ${error}`)
        throw new Error(`Kong API error: ${response.status} - ${error}`)
      }

      const consumer = (await response.json()) as KongConsumer
      this.logger.log(`Created consumer: ${username} (id: ${consumer.id})`)
      return consumer
    } catch (error) {
      this.logger.error(`Error creating consumer: ${error}`)
      throw error
    }
  }

  /**
   * Get a Kong consumer by username
   * @param username Consumer username
   * @returns Consumer object or null if not found
   */
  async getConsumer(username: string): Promise<KongConsumer | null> {
    try {
      const response = await fetch(
        `${this.kongAdminUrl}/consumers/${encodeURIComponent(username)}`,
      )

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        const error = await response.text()
        this.logger.error(`Failed to get consumer: ${error}`)
        throw new Error(`Kong API error: ${response.status}`)
      }

      return (await response.json()) as KongConsumer
    } catch (error) {
      this.logger.error(`Error getting consumer: ${error}`)
      throw error
    }
  }

  /**
   * Create or get a Kong consumer
   * @param username Consumer username
   * @param customId Custom metadata
   * @returns Consumer object
   */
  async ensureConsumer(username: string, customId?: string): Promise<KongConsumer> {
    let consumer = await this.getConsumer(username)

    if (!consumer) {
      consumer = await this.createConsumer(username, customId)
    }

    return consumer
  }

  /**
   * Create an API key (key-auth credential) for a consumer
   * @param consumerUsername Username of the consumer
   * @param apiKey Optional specific API key value (if not provided, Kong generates one)
   * @returns Credential object with the key
   */
  async createApiKey(consumerUsername: string, apiKey?: string): Promise<KongApiKeyResponse> {
    try {
      const data = new URLSearchParams()
      if (apiKey) {
        data.append('key', apiKey)
      }

      const response = await fetch(`${this.kongAdminUrl}/consumers/${consumerUsername}/key-auth`, {
        method: 'POST',
        body: data,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      // 409 = conflict (key already exists)
      if (response.status === 409) {
        this.logger.warn(`API key already exists for consumer: ${consumerUsername}`)
        // Return a placeholder - in production, retrieve existing key
        return {
          key: apiKey || 'duplicate',
          consumer_id: consumerUsername,
          created_at: Date.now(),
        }
      }

      if (!response.ok) {
        const error = await response.text()
        this.logger.error(`Failed to create API key: ${error}`)
        throw new Error(`Kong API error: ${response.status}`)
      }

      const credential = (await response.json()) as KongApiKeyResponse
      this.logger.log(`Created API key for consumer: ${consumerUsername}`)
      return credential
    } catch (error) {
      this.logger.error(`Error creating API key: ${error}`)
      throw error
    }
  }

  /**
   * List all API keys for a consumer
   * @param consumerUsername Username of the consumer
   * @returns Array of key-auth credentials
   */
  async listApiKeys(consumerUsername: string): Promise<KongCredential[]> {
    try {
      const response = await fetch(`${this.kongAdminUrl}/consumers/${consumerUsername}/key-auth`)

      if (!response.ok) {
        throw new Error(`Kong API error: ${response.status}`)
      }

      const result = (await response.json()) as KongListResponse<KongCredential>
      return result.data || []
    } catch (error) {
      this.logger.error(`Error listing API keys: ${error}`)
      throw error
    }
  }

  /**
   * Delete an API key for a consumer
   * @param consumerUsername Username of the consumer
   * @param keyId ID or key of the credential
   */
  async deleteApiKey(consumerUsername: string, keyId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.kongAdminUrl}/consumers/${consumerUsername}/key-auth/${keyId}`,
        { method: 'DELETE' },
      )

      if (!response.ok) {
        throw new Error(`Kong API error: ${response.status}`)
      }

      this.logger.log(`Deleted API key for consumer: ${consumerUsername}`)
    } catch (error) {
      this.logger.error(`Error deleting API key: ${error}`)
      throw error
    }
  }
}
