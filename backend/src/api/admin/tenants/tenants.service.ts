import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Tenant } from './entities/tenant.entity'
import { CreateTenantDto } from './schemas/create-tenant.dto'

/**
 * TenantsService
 *
 * Handles tenant database operations.
 * Manages multi-tenant data where all data is scoped under a tenant.
 */
@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name)

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Generate a URL-friendly slug from a string
   * @param name The string to convert to slug
   * @returns URL-friendly slug
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .split(/[^a-z0-9-]+/) // Split on non-alphanumeric and non-hyphen characters
      .filter(Boolean) // Remove empty strings
      .join('-') // Join with hyphens
  }

  /**
   * Create a new tenant record
   * @param createTenantDto Tenant creation data
   * @returns Created tenant
   */
  async create(createTenantDto: CreateTenantDto) {
    const { externalId, name, slug, createdBy } = createTenantDto

    // Check if tenant already exists by name
    const existing = await this.tenantRepository.findOne({ where: { name } })
    if (existing) {
      throw new BadRequestException(`Tenant with name '${name}' already exists`)
    }

    try {
      // Generate slug from name if not provided
      const tenantSlug = slug || this.generateSlug(name)

      // Check if slug already exists
      const existingSlug = await this.tenantRepository.findOne({ where: { slug: tenantSlug } })
      if (existingSlug) {
        throw new BadRequestException(`Slug '${tenantSlug}' is already in use`)
      }

      // Create tenant record in database
      const tenant = this.tenantRepository.create({
        externalId,
        name,
        slug: tenantSlug,
        status: 'active',
        createdBy,
      })

      const savedTenant = await this.tenantRepository.save(tenant)
      this.logger.debug(`Created tenant: ${name} (id: ${savedTenant.id})`)

      return {
        tenant: savedTenant,
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
   * @param id Tenant ID (UUID)
   * @returns Tenant or null if not found
   */
  async findOne(id: string): Promise<Tenant | null> {
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
   * Get a tenant by slug
   * @param slug Tenant slug
   * @returns Tenant or null if not found
   */
  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { slug } })
  }

  /**
   * Get a tenant by external ID
   * @param externalId External identifier (e.g., OAuth2 client ID, Kong consumer ID, etc.)
   * @returns Tenant or null if not found
   */
  async findByExternalId(externalId: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { externalId } })
  }

  /**
   * Update a tenant
   * @param id Tenant ID (UUID)
   * @param updateData Partial tenant data to update
   * @returns Updated tenant
   */
  async update(id: string, updateData: Partial<Tenant>): Promise<Tenant> {
    const tenant = await this.findOne(id)
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`)
    }

    const updated = Object.assign(tenant, updateData)
    return this.tenantRepository.save(updated)
  }

  /**
   * Delete a tenant (soft delete)
   * @param id Tenant ID (UUID)
   */
  async delete(id: string): Promise<void> {
    const tenant = await this.findOne(id)
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`)
    }

    try {
      await this.tenantRepository.update(id, { isDeleted: true })
      this.logger.debug(`Soft deleted tenant: ${tenant.name}`)
    } catch (error) {
      this.logger.error(`Error deleting tenant: ${error}`)
      throw error
    }
  }

  /**
   * Upsert tenant from CSTAR data
   * Creates a new tenant if it doesn't exist (matched by CSTAR id), or updates it if it does.
   * Used to sync user's tenants from CSTAR during login.
   *
   * @param cstarTenant Tenant data from CSTAR API
   * @returns Created or updated tenant
   */
  async upsertFromCstar(cstarTenant: {
    id: string
    name: string
    slug?: string
    status?: string
  }): Promise<Tenant> {
    const { id: externalId, name, slug, status } = cstarTenant

    try {
      // Check if tenant already exists by external ID (CSTAR id)
      const existing = await this.findByExternalId(externalId)

      if (existing) {
        // Update existing tenant with latest data from CSTAR
        const updated = Object.assign(existing, {
          name,
          slug: slug || existing.slug,
          status: status || existing.status,
          updatedAt: new Date(),
        })
        const savedTenant = await this.tenantRepository.save(updated)
        this.logger.debug(`Updated tenant from CSTAR: ${name} (externalId: ${externalId})`)
        return savedTenant
      }

      // Create new tenant if it doesn't exist
      const tenantSlug = slug || this.generateSlug(name)

      // Check if slug is already in use
      const existingSlug = await this.findBySlug(tenantSlug)
      if (existingSlug && existingSlug.externalId !== externalId) {
        // Slug exists for a different tenant, generate unique slug
        const uniqueSlug = `${tenantSlug}-${externalId.substring(0, 8)}`
        const finalSlug = (await this.findBySlug(uniqueSlug)) ? uniqueSlug + Date.now() : uniqueSlug
        return this.upsertFromCstar({
          id: externalId,
          name,
          slug: finalSlug,
          status,
        })
      }

      const tenant = this.tenantRepository.create({
        externalId,
        name,
        slug: tenantSlug,
        status: status || 'active',
        createdBy: 'CSTAR_SYNC',
      })

      const savedTenant = await this.tenantRepository.save(tenant)
      this.logger.debug(`Created tenant from CSTAR: ${name} (externalId: ${externalId})`)
      return savedTenant
    } catch (error) {
      this.logger.error(`Error upserting tenant from CSTAR: ${error}`)
      throw error
    }
  }
}
