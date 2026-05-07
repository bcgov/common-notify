import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClientTenantMapping } from './entities/client-tenant-mapping.entity'
import { Tenant } from '../tenants/entities/tenant.entity'
import { TenantReference } from './schemas/link-client-to-tenants.dto'

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
   * Creates ClientTenantMapping records, automatically creating tenant records if they don't exist.
   * Treats the input tenant IDs as CSTAR external tenant IDs.
   *
   * @param clientId API Gateway client ID (extracted from OAuth token)
   * @param cstarTenants Array of CSTAR tenant references (with id and name) to link to this client
   * @param createdBy User GUID of the admin who authorized this mapping
   * @returns Array of created mappings
   * @throws BadRequestException if validation fails
   */
  async linkClientToTenants(
    clientId: string,
    cstarTenants: TenantReference[],
    createdBy: string,
  ): Promise<ClientTenantMapping[]> {
    this.logger.debug(
      `linkClientToTenants called: clientId=${clientId}, tenantCount=${cstarTenants.length}, createdBy=${createdBy}`,
    )

    if (!clientId || !clientId.trim()) {
      throw new BadRequestException('client_id cannot be empty')
    }

    if (!cstarTenants || cstarTenants.length === 0) {
      throw new BadRequestException('At least one tenant must be provided')
    }

    if (!createdBy || !createdBy.trim()) {
      throw new BadRequestException('created_by cannot be empty')
    }

    const mappings: ClientTenantMapping[] = []
    const now = new Date()

    for (const tenantRef of cstarTenants) {
      if (!tenantRef.id || !tenantRef.id.trim()) {
        throw new BadRequestException('tenant_id cannot be empty')
      }

      if (!tenantRef.name || !tenantRef.name.trim()) {
        throw new BadRequestException('tenant_name cannot be empty')
      }

      this.logger.debug(`Processing CSTAR tenant: id=${tenantRef.id}, name=${tenantRef.name}`)

      // Look up tenant by external_id (CSTAR tenant ID)
      let tenant = await this.tenantRepository.findOne({
        where: { externalId: tenantRef.id, isDeleted: false },
      })

      this.logger.debug(
        `Tenant lookup by externalId=${tenantRef.id}: ${tenant ? `found (id=${tenant.id})` : 'not found'}`,
      )

      // If tenant doesn't exist, create it
      if (!tenant) {
        this.logger.debug(`Creating new tenant for CSTAR ID: ${tenantRef.id}`)

        const slug = tenantRef.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')

        tenant = this.tenantRepository.create({
          externalId: tenantRef.id,
          name: tenantRef.name,
          slug,
          status: 'active',
          createdBy,
          createdAt: now,
          updatedAt: now,
        })

        tenant = await this.tenantRepository.save(tenant)

        this.logger.debug(
          `Created new tenant: id=${tenant.id}, externalId=${tenant.externalId}, name=${tenant.name}, slug=${tenant.slug}`,
        )
      }

      // Create or reactivate client-tenant mapping
      this.logger.debug(`Creating mapping: clientId=${clientId}, tenantId=${tenant.id}`)

      const existingMapping = await this.mappingRepository.findOne({
        where: { clientId, tenantId: tenant.id, isDeleted: false },
      })

      if (existingMapping) {
        if (existingMapping.isActive) {
          const errorMsg = `Client '${clientId}' is already linked to tenant '${tenantRef.id}'`
          this.logger.warn(errorMsg)
          throw new BadRequestException(errorMsg)
        }
        // Reactivate existing inactive mapping
        existingMapping.isActive = true
        existingMapping.updatedBy = createdBy
        existingMapping.updatedAt = now
        const savedMapping = await this.mappingRepository.save(existingMapping)
        mappings.push(savedMapping)
        this.logger.debug(
          `Reactivated mapping: id=${savedMapping.id}, clientId=${clientId}, tenantId=${tenant.id}`,
        )
      } else {
        // Create new mapping
        const mapping = this.mappingRepository.create({
          clientId,
          tenantId: tenant.id,
          createdBy,
          createdAt: now,
          updatedAt: now,
          isActive: true,
        })
        const savedMapping = await this.mappingRepository.save(mapping)
        mappings.push(savedMapping)
        this.logger.debug(
          `Created new mapping: id=${savedMapping.id}, clientId=${clientId}, tenantId=${tenant.id}`,
        )
      }
    }

    this.logger.debug(
      `linkClientToTenants completed successfully: ${mappings.length} mapping(s) created/reactivated`,
    )
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
