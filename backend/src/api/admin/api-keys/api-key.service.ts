import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ApiKey } from './entities/api-key.entity'
import { GenerateApiKeyDto } from './schemas/generate-api-key.dto'
import { ApiKeyGeneratedResponseDto, ApiKeyResponseDto } from './schemas/api-key-response.dto'
import { KongAdminApiClient } from '../../../services/kong/kong-admin-api.client'
import { Tenant } from '../tenants/entities/tenant.entity'

/**
 * API Key Service
 *
 * Manages the lifecycle of API keys:
 * - Generation (calls Kong Admin API, stores metadata in DB)
 * - Revocation (removes from Kong, marks as revoked in DB)
 * - Listing and retrieval
 * - Usage tracking
 */
@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name)

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private kongAdminClient: KongAdminApiClient,
  ) {}

  /**
   * Generate a new API key for a tenant.
   *
   * @param tenantExternalId - Tenant external ID (CSTAR tenant ID)
   * @param dto - Generation request (display name, description, rate limit config)
   * @param createdBy - User ID creating the key
   * @returns Generated key response (includes actual key value - shown only once!)
   */
  async generateKey(
    tenantExternalId: string,
    dto: GenerateApiKeyDto,
    createdBy: string,
  ): Promise<ApiKeyGeneratedResponseDto> {
    this.logger.debug(`Generating API key for tenant ${tenantExternalId}`)

    try {
      // Step 0: Fetch tenant by external_id (CSTAR tenant ID)
      const tenant = await this.tenantRepository.findOne({
        where: { externalId: tenantExternalId },
      })
      if (!tenant) {
        throw new NotFoundException(`Tenant ${tenantExternalId} not found`)
      }

      // Step 1: Generate key in Kong (will create consumer if needed)
      // Kong consumer ID is stored only in the api_key table, not on the tenant
      const { keyId, keyValue, consumerId } = await this.kongAdminClient.generateKeyForTenant(
        tenant.id, // Use the internal tenant ID for Kong operations
        undefined, // Kong consumer not stored on tenant
      )

      // Step 2: Store key metadata in database
      const apiKey = this.apiKeyRepository.create({
        tenantId: tenant.id, // Store internal tenant ID in api_key table
        kongConsumerId: consumerId, // Use the Kong consumer ID returned from Kong
        kongKeyId: keyId,
        displayName: dto.displayName,
        description: dto.description,
        rateLimitConfig: dto.rateLimitConfig || null,
        createdBy,
        usageCount: 0,
      })

      await this.apiKeyRepository.save(apiKey)

      this.logger.log(`Created API key ${keyId} for tenant ${tenantExternalId}`)

      return {
        id: apiKey.id,
        tenantId: apiKey.tenantId,
        displayName: apiKey.displayName,
        description: apiKey.description,
        key: keyValue, // This is the ONLY time the key value is returned
        createdAt: apiKey.createdAt,
        createdBy: apiKey.createdBy,
        rateLimitConfig: apiKey.rateLimitConfig,
      }
    } catch (error) {
      this.logger.error(`Failed to generate API key for tenant ${tenantExternalId}`, error)
      throw error
    }
  }

  /**
   * Revoke an API key (soft delete in Kong, mark as revoked in DB).
   *
   * @param tenantExternalId - Tenant external ID (CSTAR tenant ID)
   * @param keyId - API key record UUID (our database ID, not Kong's)
   * @param revokedBy - User ID revoking the key
   */
  async revokeKey(tenantExternalId: string, keyId: string, revokedBy: string): Promise<void> {
    this.logger.debug(`Revoking API key ${keyId} for tenant ${tenantExternalId}`)

    // Look up tenant by external ID
    const tenant = await this.tenantRepository.findOne({ where: { externalId: tenantExternalId } })
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantExternalId} not found`)
    }

    // Find the key record
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id: keyId, tenantId: tenant.id },
    })

    if (!apiKey) {
      throw new NotFoundException(`API key ${keyId} not found for tenant ${tenantExternalId}`)
    }

    if (!apiKey.isActive) {
      throw new BadRequestException(`API key ${keyId} is already revoked`)
    }

    try {
      // Step 1: Revoke from Kong
      await this.kongAdminClient.revokeKey(tenant.id, apiKey.kongKeyId)

      // Step 2: Mark as revoked in database
      apiKey.revokedAt = new Date()
      apiKey.revokedBy = revokedBy
      await this.apiKeyRepository.save(apiKey)

      this.logger.log(`Revoked API key ${keyId} for tenant ${tenantExternalId}`)
    } catch (error) {
      this.logger.error(`Failed to revoke API key ${keyId} for tenant ${tenantExternalId}`, error)
      throw error
    }
  }

  /**
   * Get details of a specific API key (without the actual key value).
   *
   * @param tenantExternalId - Tenant external ID (CSTAR tenant ID)
   * @param keyId - API key record UUID
   * @returns API key details
   */
  async getKey(tenantExternalId: string, keyId: string): Promise<ApiKeyResponseDto> {
    // Look up tenant by external ID
    const tenant = await this.tenantRepository.findOne({ where: { externalId: tenantExternalId } })
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantExternalId} not found`)
    }

    const apiKey = await this.apiKeyRepository.findOne({
      where: { id: keyId, tenantId: tenant.id },
    })

    if (!apiKey) {
      throw new NotFoundException(`API key ${keyId} not found for tenant ${tenantExternalId}`)
    }

    return this.mapToResponseDto(apiKey)
  }

  /**
   * List all API keys for a tenant.
   *
   * @param tenantExternalId - Tenant external ID (CSTAR tenant ID)
   * @param options - Pagination/filtering options
   * @returns List of API key details (active and revoked)
   */
  async listKeys(
    tenantExternalId: string,
    options?: { activeOnly?: boolean; skip?: number; take?: number },
  ): Promise<{ data: ApiKeyResponseDto[]; total: number }> {
    // Look up tenant by external ID
    const tenant = await this.tenantRepository.findOne({ where: { externalId: tenantExternalId } })
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantExternalId} not found`)
    }

    const query = this.apiKeyRepository.createQueryBuilder('ak').where('ak.tenantId = :tenantId', {
      tenantId: tenant.id,
    })

    if (options?.activeOnly) {
      query.andWhere('ak.revokedAt IS NULL')
    }

    const total = await query.getCount()

    const keys = await query
      .orderBy('ak.createdAt', 'DESC')
      .skip(options?.skip || 0)
      .take(options?.take || 100)
      .getMany()

    return {
      data: keys.map((key) => this.mapToResponseDto(key)),
      total,
    }
  }

  /**
   * Get active API keys for a tenant (used for authentication validation).
   * This is an internal method used by guard/middleware.
   *
   * @param tenantId - Tenant UUID
   * @returns Active API keys for the tenant
   */
  async getActiveKeysForTenant(tenantId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { tenantId, revokedAt: null },
    })
  }

  /**
   * Record usage of an API key (increment counter, update last used timestamp).
   * Called when a key is used for authentication.
   *
   * @param kongKeyId - Kong's key ID (stored in our API key record)
   */
  async recordKeyUsage(kongKeyId: string): Promise<void> {
    try {
      await this.apiKeyRepository.update(
        { kongKeyId },
        {
          usageCount: () => 'usage_count + 1',
          lastUsedAt: new Date(),
        },
      )
    } catch (error) {
      // Don't fail the request if usage tracking fails
      this.logger.warn(`Failed to record usage for key ${kongKeyId}`, error)
    }
  }

  /**
   * Map API key entity to response DTO (excluding sensitive fields).
   *
   * @param apiKey - API key entity
   * @returns Response DTO
   */
  private mapToResponseDto(apiKey: ApiKey): ApiKeyResponseDto {
    return {
      id: apiKey.id,
      tenantId: apiKey.tenantId,
      displayName: apiKey.displayName,
      description: apiKey.description,
      usageCount: apiKey.usageCount,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
      createdBy: apiKey.createdBy,
      revokedAt: apiKey.revokedAt,
      revokedBy: apiKey.revokedBy,
      rateLimitConfig: apiKey.rateLimitConfig,
      isActive: apiKey.isActive,
    }
  }
}
