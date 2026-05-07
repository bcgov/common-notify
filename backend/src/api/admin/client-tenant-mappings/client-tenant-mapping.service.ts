import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { ClientTenantMapping } from './entities/client-tenant-mapping.entity'
import { Tenant } from '../tenants/entities/tenant.entity'

/**
 * ClientTenantMappingService
 *
 * Manages the mapping between API Gateway client IDs and CSTAR tenants.
 * Enables service-to-service access by linking OAuth2 client credentials to authorized tenants.
 */
@Injectable()
export class ClientTenantMappingService {
  private readonly logger = new Logger(ClientTenantMappingService.name)

  constructor(
    @InjectRepository(ClientTenantMapping)
    private readonly mappingRepository: Repository<ClientTenantMapping>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Link a client ID to one or more tenants
   * Creates ClientTenantMapping records after verifying ownership of both client and tenants
   *
   * @param clientId API Gateway client ID (extracted from OAuth token)
   * @param tenantIds Array of tenant UUIDs to link to this client
   * @param createdBy User GUID of the admin who authorized this mapping
   * @returns Array of created mappings
   * @throws BadRequestException if tenants don't exist or client already linked
   */
  async linkClientToTenants(
    clientId: string,
    tenantIds: string[],
    createdBy: string,
  ): Promise<ClientTenantMapping[]> {
    if (!clientId || !clientId.trim()) {
      throw new BadRequestException('client_id cannot be empty')
    }

    if (!tenantIds || tenantIds.length === 0) {
      throw new BadRequestException('At least one tenant_id must be provided')
    }

    if (!createdBy || !createdBy.trim()) {
      throw new BadRequestException('created_by cannot be empty')
    }

    // Verify all tenants exist
    const tenants = await this.tenantRepository.find({
      where: { id: In(tenantIds), isDeleted: false },
    })

    if (tenants.length !== tenantIds.length) {
      const foundIds = new Set(tenants.map((t) => t.id))
      const missingIds = tenantIds.filter((id) => !foundIds.has(id))
      throw new BadRequestException(
        `The following tenant IDs do not exist or are deleted: ${missingIds.join(', ')}`,
      )
    }

    const mappings: ClientTenantMapping[] = []

    for (const tenantId of tenantIds) {
      // Check if mapping already exists (active or inactive)
      const existingMapping = await this.mappingRepository.findOne({
        where: { clientId, tenantId, isDeleted: false },
      })

      if (existingMapping) {
        if (existingMapping.isActive) {
          throw new BadRequestException(
            `Client '${clientId}' is already linked to tenant '${tenantId}'`,
          )
        }
        // Reactivate existing inactive mapping
        existingMapping.isActive = true
        existingMapping.updatedBy = createdBy
        existingMapping.updatedAt = new Date()
        const savedMapping = await this.mappingRepository.save(existingMapping)
        mappings.push(savedMapping)
        this.logger.debug(
          `Reactivated mapping: client_id=${clientId}, tenant_id=${tenantId}, by=${createdBy}`,
        )
      } else {
        // Create new mapping
        const now = new Date()
        const mapping = this.mappingRepository.create({
          clientId,
          tenantId,
          createdBy,
          createdAt: now,
          updatedAt: now,
          isActive: true,
        })
        const savedMapping = await this.mappingRepository.save(mapping)
        mappings.push(savedMapping)
        this.logger.debug(
          `Created mapping: client_id=${clientId}, tenant_id=${tenantId}, by=${createdBy}`,
        )
      }
    }

    return mappings
  }

  /**
   * Find all tenants accessible via a client ID
   * Used during request processing when client credentials are provided
   *
   * @param clientId API Gateway client ID
   * @returns Array of tenant IDs accessible by this client
   */
  async findTenantsByClientId(clientId: string): Promise<string[]> {
    if (!clientId || !clientId.trim()) {
      return []
    }

    const mappings = await this.mappingRepository.find({
      where: { clientId, isActive: true, isDeleted: false },
      select: ['tenantId'],
    })

    return mappings.map((m) => m.tenantId)
  }

  /**
   * Find all active clients for a tenant
   * Used in admin UI to show which API clients can access a tenant
   *
   * @param tenantId Tenant UUID
   * @returns Array of active mappings with client details
   */
  async findClientsByTenantId(tenantId: string): Promise<ClientTenantMapping[]> {
    if (!tenantId || !tenantId.trim()) {
      return []
    }

    return this.mappingRepository.find({
      where: { tenantId, isActive: true, isDeleted: false },
      order: { createdAt: 'DESC' },
    })
  }

  /**
   * Get a specific client-tenant mapping
   *
   * @param clientId API Gateway client ID
   * @param tenantId Tenant UUID
   * @returns The mapping record
   * @throws NotFoundException if mapping doesn't exist
   */
  async getMappingByClientAndTenant(
    clientId: string,
    tenantId: string,
  ): Promise<ClientTenantMapping> {
    const mapping = await this.mappingRepository.findOne({
      where: { clientId, tenantId, isDeleted: false },
    })

    if (!mapping) {
      throw new NotFoundException(
        `No mapping found for client '${clientId}' and tenant '${tenantId}'`,
      )
    }

    return mapping
  }

  /**
   * Deactivate a client-tenant mapping (prevent access without deletion)
   * The mapping record is preserved for audit purposes
   *
   * @param clientId API Gateway client ID
   * @param tenantId Tenant UUID
   * @param updatedBy User GUID of the admin who deactivated the mapping
   * @returns The updated mapping
   * @throws NotFoundException if mapping doesn't exist
   */
  async deactivateMapping(
    clientId: string,
    tenantId: string,
    updatedBy: string,
  ): Promise<ClientTenantMapping> {
    const mapping = await this.getMappingByClientAndTenant(clientId, tenantId)

    if (!mapping.isActive) {
      throw new BadRequestException(
        `Mapping for client '${clientId}' and tenant '${tenantId}' is already inactive`,
      )
    }

    mapping.isActive = false
    mapping.updatedBy = updatedBy
    const updated = await this.mappingRepository.save(mapping)
    this.logger.debug(
      `Deactivated mapping: client_id=${clientId}, tenant_id=${tenantId}, by=${updatedBy}`,
    )
    return updated
  }

  /**
   * Reactivate a deactivated client-tenant mapping
   * Only works on inactive mappings (soft deletes cannot be restored directly)
   *
   * @param clientId API Gateway client ID
   * @param tenantId Tenant UUID
   * @param updatedBy User GUID of the admin who reactivated the mapping
   * @returns The updated mapping
   * @throws NotFoundException if mapping doesn't exist
   * @throws BadRequestException if mapping is already active or soft deleted
   */
  async reactivateMapping(
    clientId: string,
    tenantId: string,
    updatedBy: string,
  ): Promise<ClientTenantMapping> {
    const mapping = await this.getMappingByClientAndTenant(clientId, tenantId)

    if (mapping.isActive) {
      throw new BadRequestException(
        `Mapping for client '${clientId}' and tenant '${tenantId}' is already active`,
      )
    }

    mapping.isActive = true
    mapping.updatedBy = updatedBy
    const updated = await this.mappingRepository.save(mapping)
    this.logger.debug(
      `Reactivated mapping: client_id=${clientId}, tenant_id=${tenantId}, by=${updatedBy}`,
    )
    return updated
  }

  /**
   * Soft delete a client-tenant mapping
   * The record is marked as deleted but preserved for audit purposes
   *
   * @param clientId API Gateway client ID
   * @param tenantId Tenant UUID
   * @param updatedBy User GUID of the admin who deleted the mapping
   * @returns The deleted mapping
   * @throws NotFoundException if mapping doesn't exist
   */
  async deleteMapping(
    clientId: string,
    tenantId: string,
    updatedBy: string,
  ): Promise<ClientTenantMapping> {
    const mapping = await this.getMappingByClientAndTenant(clientId, tenantId)

    mapping.isDeleted = true
    mapping.isActive = false
    mapping.updatedBy = updatedBy
    const updated = await this.mappingRepository.save(mapping)
    this.logger.debug(
      `Deleted mapping: client_id=${clientId}, tenant_id=${tenantId}, by=${updatedBy}`,
    )
    return updated
  }

  /**
   * Get all mappings for a client (including inactive and deleted)
   * Used for admin auditing and historical review
   *
   * @param clientId API Gateway client ID
   * @param includeDeleted Whether to include soft-deleted records
   * @returns Array of mappings
   */
  async getAllMappingsForClient(
    clientId: string,
    includeDeleted = false,
  ): Promise<ClientTenantMapping[]> {
    if (!clientId || !clientId.trim()) {
      return []
    }

    const query = this.mappingRepository
      .createQueryBuilder('mapping')
      .where('mapping.clientId = :clientId', {
        clientId,
      })

    if (!includeDeleted) {
      query.andWhere('mapping.isDeleted = false')
    }

    return query.orderBy('mapping.createdAt', 'DESC').getMany()
  }

  /**
   * Get all mappings for a tenant (including inactive and deleted)
   * Used for admin auditing and tenant lifecycle management
   *
   * @param tenantId Tenant UUID
   * @param includeDeleted Whether to include soft-deleted records
   * @returns Array of mappings
   */
  async getAllMappingsForTenant(
    tenantId: string,
    includeDeleted = false,
  ): Promise<ClientTenantMapping[]> {
    if (!tenantId || !tenantId.trim()) {
      return []
    }

    const query = this.mappingRepository
      .createQueryBuilder('mapping')
      .where('mapping.tenantId = :tenantId', {
        tenantId,
      })

    if (!includeDeleted) {
      query.andWhere('mapping.isDeleted = false')
    }

    return query.orderBy('mapping.createdAt', 'DESC').getMany()
  }

  /**
   * Get all non-deleted mappings
   * Used for display in admin UI
   *
   * @returns Array of all active mappings
   */
  async findAll(): Promise<ClientTenantMapping[]> {
    return this.mappingRepository.find({
      where: { isDeleted: false },
      relations: ['tenant'],
      order: { createdAt: 'DESC' },
    })
  }

  /**
   * Toggle the active status of a mapping
   * @param id Mapping UUID
   * @param updatedBy User GUID performing the update
   * @returns Updated mapping
   * @throws NotFoundException if mapping doesn't exist
   */
  async toggleActiveStatus(id: string, updatedBy: string): Promise<ClientTenantMapping> {
    const mapping = await this.mappingRepository.findOne({
      where: { id, isDeleted: false },
    })

    if (!mapping) {
      throw new NotFoundException(`Mapping with id ${id} not found`)
    }

    mapping.isActive = !mapping.isActive
    mapping.updatedBy = updatedBy
    mapping.updatedAt = new Date()

    const updated = await this.mappingRepository.save(mapping)
    this.logger.debug(`Toggled mapping ${id}: is_active=${updated.isActive}, by=${updatedBy}`)
    return updated
  }
}
