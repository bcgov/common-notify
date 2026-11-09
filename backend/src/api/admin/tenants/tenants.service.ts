import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Tenant } from './entities/tenant.entity'
import { TenantSendingHistory } from './entities/tenant-sending-history.entity'
import { CreateTenantDto } from './schemas/create-tenant.dto'

/**
 * TenantsService
 *
 * Handles tenant database operations.
 * Manages multi-tenant data where all data is scoped under a tenant.
 */
export const TENANT_ACTIVE = 'active'
export const TENANT_DISABLED = 'disabled'

/** Who is changing a tenant, from their JWT. */
export interface TenantActor {
  id: string
  name: string | null
}

/** What a rejected send says. The reason is the admin's, so tenant users know why. */
export function sendingDisabledMessage(reason: string | null): string {
  const base = 'Sending is disabled for this tenant by the Notify team'
  return reason ? `${base}: ${reason}` : `${base}.`
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name)

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
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
        // Only the fields CSTAR owns. Saving the whole entity would also write back the status it
        // was loaded with, undoing an admin's disable made in the meantime.
        const changes = { name, slug: slug || existing.slug, updatedAt: new Date() }
        await this.tenantRepository.update(existing.id, changes)
        this.logger.debug(`Updated tenant from CSTAR: ${name} (externalId: ${externalId})`)
        return Object.assign(existing, changes)
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

  /**
   * Rejects a send from a tenant an admin has disabled. Read from the database on every send,
   * so a disable takes effect on every pod at once.
   */
  async assertCanSend(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository
      .createQueryBuilder('t')
      .select(['t.id', 't.status', 't.disabledReason'])
      .where('t.id = :tenantId', { tenantId })
      .getOne()
    if (tenant?.status === TENANT_DISABLED) {
      throw new ForbiddenException(sendingDisabledMessage(tenant.disabledReason))
    }
  }

  /** Whether an admin has disabled sending for the tenant. */
  async isSendingDisabled(tenantId: string): Promise<boolean> {
    const tenant = await this.tenantRepository
      .createQueryBuilder('t')
      .select(['t.id', 't.status'])
      .where('t.id = :tenantId', { tenantId })
      .getOne()
    return tenant?.status === TENANT_DISABLED
  }

  /**
   * Enable or disable sending for a tenant, recording the change in tenant_sending_history in
   * the same transaction. Setting the state it already has changes and records nothing.
   *
   * @param reason Required when disabling; ignored when enabling
   * @returns Whether the tenant can now send
   */
  async setSending(
    tenantId: string,
    enabled: boolean,
    reason: string | undefined,
    actor: TenantActor,
  ): Promise<boolean> {
    const trimmed = reason?.trim() || null
    if (!enabled && !trimmed) {
      throw new BadRequestException('A reason is required to disable sending')
    }

    return this.tenantRepository.manager.transaction(async (manager) => {
      // Row lock, so two admins changing the same tenant at once record one change, not two.
      // Eager relations off: FOR UPDATE can't lock the outer join they add.
      const tenant = await manager.findOne(Tenant, {
        where: { id: tenantId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      })
      if (!tenant) {
        throw new NotFoundException('Tenant not found')
      }
      if ((tenant.status !== TENANT_DISABLED) === enabled) {
        return enabled
      }

      // status is read-only on the entity (it is written through the status-code relation), so
      // the update is SQL.
      await manager.query(
        `UPDATE notify.tenant
            SET status = $2, disabled_reason = $3, disabled_by = $4, disabled_by_name = $5,
                disabled_at = $6, updated_by = $7
          WHERE id = $1`,
        enabled
          ? [tenantId, TENANT_ACTIVE, null, null, null, null, actor.id]
          : [tenantId, TENANT_DISABLED, trimmed, actor.id, actor.name, new Date(), actor.id],
      )
      await manager.save(
        manager.create(TenantSendingHistory, {
          tenantId,
          enabled,
          reason: enabled ? null : trimmed,
          createdBy: actor.id,
          createdByName: actor.name,
        }),
      )
      this.logger.log(
        `Sending ${enabled ? 'enabled' : 'disabled'} for tenant ${tenantId} by ${actor.id}`,
      )
      return enabled
    })
  }
}
