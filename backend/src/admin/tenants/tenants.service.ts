import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Tenant } from './entities/tenant.entity'
import { CreateTenantDto } from './dto/create-tenant.dto'

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
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters (specific character class)
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+/, '') // Remove leading hyphens
      .replace(/-+$/, '') // Remove trailing hyphens
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
      this.logger.log(`Created tenant: ${name} (id: ${savedTenant.id})`)

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
      this.logger.log(`Soft deleted tenant: ${tenant.name}`)
    } catch (error) {
      this.logger.error(`Error deleting tenant: ${error}`)
      throw error
    }
  }
}
