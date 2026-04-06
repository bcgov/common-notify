import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

/**
 * API Gateway GraphQL Service
 * Handles GraphQL mutations to the remote APS API Gateway for managing consumers and credentials
 * In local environment, falls back to Kong Admin API
 */
@Injectable()
export class ApiGatewayService {
  private readonly logger = new Logger(ApiGatewayService.name)
  private readonly httpClient: AxiosInstance
  private readonly environment: string
  private readonly useGraphQL: boolean
  private gatewayToken: string | null = null
  private tokenExpiresAt: number = 0

  private readonly graphqlUrl: string
  private readonly namespace: string
  private readonly serviceAccountClientId: string
  private readonly serviceAccountClientSecret: string
  private readonly tokenUrl: string

  constructor(private configService: ConfigService) {
    this.environment = this.configService.get('ENVIRONMENT') || 'local'
    this.useGraphQL = this.environment !== 'local'

    // GraphQL configuration (used in dev/test/prod)
    this.graphqlUrl = this.configService.get('API_GATEWAY_GRAPHQL_URL') || ''
    this.namespace = this.configService.get('API_GATEWAY_NAMESPACE') || 'ns.gw-fe8c5'
    this.serviceAccountClientId = this.configService.get('API_GATEWAY_CLIENT_ID') || ''
    this.serviceAccountClientSecret = this.configService.get('API_GATEWAY_CLIENT_SECRET') || ''
    this.tokenUrl = this.configService.get('API_GATEWAY_TOKEN_URL') || ''

    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.logger.log(
      `ApiGatewayService initialized for environment: ${this.environment} (using ${this.useGraphQL ? 'GraphQL' : 'local Kong'})`,
    )
  }

  /**
   * Create a consumer (tenant) in the API Gateway
   * @param username Unique identifier for the tenant
   * @param customId Custom metadata for the tenant
   * @returns Consumer object with id and username
   */
  async createConsumer(
    username: string,
    customId?: string,
  ): Promise<{ id: string; username: string }> {
    if (!this.useGraphQL) {
      this.logger.debug(`[LOCAL] Skipping consumer creation (Kong only in local environment)`)
      return { id: username, username }
    }

    try {
      await this.ensureToken()

      const query = `
        mutation CreateConsumer($input: CreateConsumerInput!) {
          createConsumer(input: $input) {
            id
            username
          }
        }
      `

      const variables = {
        input: {
          username,
          customId: customId || username,
        },
      }

      const response = await this.httpClient.post(
        this.graphqlUrl,
        { query, variables },
        {
          headers: {
            Authorization: `Bearer ${this.gatewayToken}`,
          },
        },
      )

      if (response.data.errors) {
        const errorMessage = response.data.errors[0].message
        throw new BadRequestException(`API Gateway error: ${errorMessage}`)
      }

      const consumer = response.data.data?.createConsumer
      if (!consumer) {
        throw new BadRequestException('No consumer data returned from API Gateway')
      }

      this.logger.log(`Created consumer in API Gateway: ${username}`)
      return consumer
    } catch (error) {
      this.logger.error(`Error creating consumer in API Gateway: ${error}`)
      throw error
    }
  }

  /**
   * Link a consumer to a namespace in the API Gateway
   * @param username Consumer username to link
   * @returns Success status
   */
  async linkConsumerToNamespace(username: string): Promise<boolean> {
    if (!this.useGraphQL) {
      this.logger.debug(`[LOCAL] Skipping namespace link (only applies in API Gateway environment)`)
      return true
    }

    try {
      await this.ensureToken()

      const query = `
        mutation LinkConsumerToNamespace($namespace: String!, $username: String!) {
          linkConsumerToNamespace(namespace: $namespace, username: $username) {
            success
          }
        }
      `

      const variables = {
        namespace: this.namespace,
        username,
      }

      const response = await this.httpClient.post(
        this.graphqlUrl,
        { query, variables },
        {
          headers: {
            Authorization: `Bearer ${this.gatewayToken}`,
          },
        },
      )

      if (response.data.errors) {
        const errorMessage = response.data.errors[0].message
        throw new BadRequestException(`API Gateway error: ${errorMessage}`)
      }

      const result = response.data.data?.linkConsumerToNamespace
      if (!result?.success) {
        throw new BadRequestException('Failed to link consumer to namespace')
      }

      this.logger.log(`Linked consumer ${username} to namespace ${this.namespace}`)
      return true
    } catch (error) {
      this.logger.error(`Error linking consumer to namespace: ${error}`)
      throw error
    }
  }

  /**
   * Create an API key credential in the API Gateway
   * @param consumerId Consumer ID to create credential for
   * @returns Credential object with id and key
   */
  async createApiKeyCredential(consumerId: string): Promise<{ id: string; key: string }> {
    if (!this.useGraphQL) {
      this.logger.debug(
        `[LOCAL] Skipping credential creation in API Gateway (Kong handles this locally)`,
      )
      // Return a placeholder - actual creation happens in Kong
      return { id: consumerId, key: '' }
    }

    try {
      await this.ensureToken()

      const query = `
        mutation CreateCredential($consumerId: ID!) {
          createCredential(consumerId: $consumerId) {
            id
            key
          }
        }
      `

      const variables = {
        consumerId,
      }

      const response = await this.httpClient.post(
        this.graphqlUrl,
        { query, variables },
        {
          headers: {
            Authorization: `Bearer ${this.gatewayToken}`,
          },
        },
      )

      if (response.data.errors) {
        const errorMessage = response.data.errors[0].message
        throw new BadRequestException(`API Gateway error: ${errorMessage}`)
      }

      const credential = response.data.data?.createCredential
      if (!credential) {
        throw new BadRequestException('No credential data returned from API Gateway')
      }

      this.logger.log(`Created API key credential in API Gateway for consumer ${consumerId}`)
      return credential
    } catch (error) {
      this.logger.error(`Error creating API key credential: ${error}`)
      throw error
    }
  }

  /**
   * Get a valid service account token from Keycloak
   * Caches token and refreshes when expired
   */
  private async ensureToken(): Promise<string> {
    // Return cached token if still valid
    if (this.gatewayToken && this.tokenExpiresAt > Date.now()) {
      return this.gatewayToken
    }

    try {
      this.logger.debug('Requesting new service account token from Keycloak')

      const response = await this.httpClient.post(this.tokenUrl, null, {
        auth: {
          username: this.serviceAccountClientId,
          password: this.serviceAccountClientSecret,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: new URLSearchParams({
          grant_type: 'client_credentials',
        }),
      })

      this.gatewayToken = response.data.access_token
      // Set expiration to 1 minute before actual expiry
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000

      this.logger.debug('Service account token retrieved successfully')
      return this.gatewayToken
    } catch (error) {
      this.logger.error(`Failed to obtain service account token: ${error}`)
      throw new BadRequestException('Failed to authenticate with API Gateway')
    }
  }

  /**
   * Check if using GraphQL (non-local environment)
   */
  isUsingGraphQL(): boolean {
    return this.useGraphQL
  }

  /**
   * Get current environment
   */
  getEnvironment(): string {
    return this.environment
  }
}
