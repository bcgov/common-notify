import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Tenant } from './entities/tenant.entity'
import { CreateTenantDto } from './dto/create-tenant.dto'

/**
 * TenantsService
 *
 * Handles tenant database operations only.
 * In local environment: tenants are seeded via kong-seed.sh
 * In production: tenants are created and managed via external tenant management system
 */
@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name)

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Create a new tenant record
   * @param createTenantDto Tenant creation data
   * @param options Optional metadata like kongUsername or oauth2ClientId
   * @returns Created tenant
   */
  async create(
    createTenantDto: CreateTenantDto,
    options?: {
      kongUsername?: string
      oauth2ClientId?: string
    },
  ) {
    const { name, description, organization, contactEmail, contactName } = createTenantDto

    // Check if tenant already exists
    const existing = await this.tenantRepository.findOne({ where: { name } })
    if (existing) {
      throw new BadRequestException(`Tenant with name '${name}' already exists`)
    }

    try {
      // Create tenant record in database
      const tenant = this.tenantRepository.create({
        name,
        description,
        organization,
        contactEmail,
        contactName,
        kongUsername: options?.kongUsername,
        oauth2ClientId: options?.oauth2ClientId,
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
   * Delete a tenant
   * @param id Tenant ID
   */
  async delete(id: number): Promise<void> {
    const tenant = await this.findOne(id)
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`)
    }

    try {
      await this.tenantRepository.delete(id)
      this.logger.log(`Deleted tenant: ${tenant.name}`)
    } catch (error) {
      this.logger.error(`Error deleting tenant: ${error}`)
      throw error
    }
  }
}
