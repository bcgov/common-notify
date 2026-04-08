import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Tenant } from './entities/tenant.entity'
import { CreateTenantDto } from './dto/create-tenant.dto'
import { KongService } from '../../shared/kong/kong.service'
import { ApiGatewayService } from '../../shared/api-gateway/api-gateway.service'

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name)

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private kongService: KongService,
    private apiGatewayService: ApiGatewayService,
  ) {}

  /**
   * Create a new tenant and register it with Kong and/or API Gateway
   * In local environment: creates consumer in Kong only
   * In dev/test/prod: creates consumer in Kong AND registers with API Gateway GraphQL
   * @param createTenantDto Tenant creation data
   * @returns Tenant and generated API key
   */
  async create(createTenantDto: CreateTenantDto) {
    const { name, description, organization, contactEmail, contactName } = createTenantDto

    // Check if tenant already exists
    const existing = await this.tenantRepository.findOne({ where: { name } })
    if (existing) {
      throw new BadRequestException(`Tenant with name '${name}' already exists`)
    }

    try {
      // Step 1: Create consumer in Kong (always, as Kong is the actual gateway)
      const consumer = await this.kongService.ensureConsumer(name, name)
      this.logger.log(`Created Kong consumer for tenant: ${name} (consumer_id: ${consumer.id})`)

      // Step 2: If in dev/test/prod, also register consumer with API Gateway GraphQL
      if (this.apiGatewayService.isUsingGraphQL()) {
        try {
          await this.apiGatewayService.createConsumer(name, name)
          this.logger.log(`Registered consumer in API Gateway: ${name}`)

          // Link consumer to the correct namespace in API Gateway
          await this.apiGatewayService.linkConsumerToNamespace(name)
          this.logger.log(`Linked consumer ${name} to API Gateway namespace`)
        } catch (error) {
          this.logger.error(`Warning: Failed to register consumer in API Gateway: ${error}`)
          // Don't fail the whole tenant creation - Kong is the primary gateway
        }
      }

      // Step 3: Create API key in Kong
      const credential = await this.kongService.createApiKey(name)
      const apiKey = credential.key

      // Step 4: Store tenant metadata in database
      const tenant = this.tenantRepository.create({
        name,
        description,
        organization,
        contactEmail,
        contactName,
        kongConsumerId: consumer.id,
        kongUsername: consumer.username,
        status: 'active',
      })

      const savedTenant = await this.tenantRepository.save(tenant)
      this.logger.log(
        `Created tenant: ${name} (id: ${savedTenant.id}, environment: ${this.apiGatewayService.getEnvironment()})`,
      )

      return {
        tenant: savedTenant,
        apiKey,
        note: 'Store this key securely. It cannot be retrieved later. Use it in the `x-api-key` header when calling the API.',
      }
    } catch (error) {
      this.logger.error(`Error creating tenant: ${error}`)
      throw error
    }
  }

  /**
   * Get all tenants
   * @returns List of all tenants
   */
  async findAll(): Promise<Tenant[]> {
    return this.tenantRepository.find()
  }

  /**
   * Get a single tenant by ID
   * @param id Tenant ID
   * @returns Tenant or null if not found
   */
  async findOne(id: number): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { id } })
  }

  /**
   * Get a tenant by name
   * @param name Tenant name
   * @returns Tenant or null if not found
   */
  async findByName(name: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { name } })
  }

  /**
   * Get a tenant by Kong username
   * @param kongUsername Kong consumer username
   * @returns Tenant or null if not found
   */
  async findByKongUsername(kongUsername: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { kongUsername } })
  }

  /**
   * Get a tenant by OAuth2 client ID
   * @param oauth2ClientId OAuth2 client ID
   * @returns Tenant or null if not found
   */
  async findByOAuth2ClientId(oauth2ClientId: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { oauth2ClientId } })
  }

  /**
   * Update a tenant
   * @param id Tenant ID
   * @param updateData Partial tenant data to update
   * @returns Updated tenant
   */
  async update(id: number, updateData: Partial<Tenant>): Promise<Tenant> {
    const tenant = await this.findOne(id)
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`)
    }

    const updated = Object.assign(tenant, updateData)
    return this.tenantRepository.save(updated)
  }

  /**
   * Delete a tenant and revoke all API keys
   * @param id Tenant ID
   */
  async delete(id: number): Promise<void> {
    const tenant = await this.findOne(id)
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`)
    }

    try {
      // Delete all API keys from Kong
      const keys = await this.kongService.listApiKeys(tenant.kongUsername)
      for (const key of keys) {
        await this.kongService.deleteApiKey(tenant.kongUsername, key.id)
      }

      // Delete tenant from database
      await this.tenantRepository.delete(id)
      this.logger.log(`Deleted tenant: ${tenant.name}`)
    } catch (error) {
      this.logger.error(`Error deleting tenant: ${error}`)
      throw error
    }
  }

  /**
   * Generate a new API key for a tenant
   * @param tenantId Tenant ID
   * @returns New API key
   */
  async generateApiKey(tenantId: number) {
    const tenant = await this.findOne(tenantId)
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${tenantId} not found`)
    }

    try {
      const credential = await this.kongService.createApiKey(tenant.kongUsername)
      return {
        apiKey: credential.key,
        note: 'Store this key securely. It cannot be retrieved later.',
      }
    } catch (error) {
      this.logger.error(`Error generating API key: ${error}`)
      throw error
    }
  }

  /**
   * List all API keys for a tenant
   * @param tenantId Tenant ID
   * @returns List of API key metadata (not the actual keys)
   */
  async listApiKeys(tenantId: number) {
    const tenant = await this.findOne(tenantId)
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${tenantId} not found`)
    }

    try {
      const keys = await this.kongService.listApiKeys(tenant.kongUsername)
      // Return key IDs and creation dates, but not the actual key values
      return keys.map((key) => ({
        id: key.id,
        createdAt: new Date(key.created_at * 1000), // Kong returns Unix timestamp
      }))
    } catch (error) {
      this.logger.error(`Error listing API keys: ${error}`)
      throw error
    }
  }

  /**
   * Revoke an API key for a tenant
   * @param tenantId Tenant ID
   * @param keyId API key ID
   */
  async revokeApiKey(tenantId: number, keyId: string): Promise<void> {
    // Validate keyId to prevent path traversal or injection into Kong Admin URL
    // Accept only URL-safe credential IDs (alphanumeric, underscore, hyphen)
    const KEY_ID_REGEX = /^[A-Za-z0-9_-]+$/
    if (!KEY_ID_REGEX.test(keyId)) {
      throw new BadRequestException('Invalid API key identifier')
    }

    const tenant = await this.findOne(tenantId)
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${tenantId} not found`)
    }

    try {
      await this.kongService.deleteApiKey(tenant.kongUsername, keyId)
      this.logger.log(`Revoked API key for tenant: ${tenant.name}`)
    } catch (error) {
      this.logger.error(`Error revoking API key: ${error}`)
      throw error
    }
  }
}
