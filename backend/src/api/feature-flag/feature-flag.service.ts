import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { FeatureFlag } from './entities/feature-flag.entity'
import { FeatureFlagHistory } from './entities/feature-flag-history.entity'
import { CreateFeatureFlagDto } from './schemas/create-feature-flag.dto'
import { UpdateFeatureFlagDto } from './schemas/update-feature-flag.dto'
import { PaginatedFeatureFlagHistoryResponse } from './schemas/paginated-feature-flag-history-response'

/**
 * Feature Flag Service
 *
 * Manages feature toggles with tenant-level overrides.
 * Resolution strategy: tenant-specific flag > global flag > default false
 *
 * Example usage:
 *   // Check if SMS is enabled for a specific tenant
 *   const smsEnabled = await this.featureFlagService.isEnabled('sms_notifications', tenantId);
 *
 *   // Check global flag
 *   const sseEnabled = await this.featureFlagService.isEnabled('sse_notifications');
 */
/** Who made a change: the stable id stored as updatedBy, and a name to show for it. */
export interface FeatureFlagActor {
  id: string
  name: string | null
}

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name)

  constructor(
    @InjectRepository(FeatureFlag)
    private readonly featureFlagRepository: Repository<FeatureFlag>,
    @InjectRepository(FeatureFlagHistory)
    private readonly historyRepository: Repository<FeatureFlagHistory>,
  ) {}

  /**
   * Check if a feature is enabled for a tenant or globally
   *
   * Resolution strategy:
   * 1. If tenantId provided: check tenant-specific override
   * 2. If override not found: check global flag (tenantId = NULL)
   * 3. If neither found: return false (default)
   *
   * @param code - Feature code (e.g., 'sms_notifications')
   * @param tenantId - Tenant UUID (optional, for tenant-specific checks)
   * @returns boolean - Whether the feature is enabled
   */
  async isEnabled(code: string, tenantId?: string): Promise<boolean> {
    try {
      // If tenantId provided, first check for tenant-specific override
      if (tenantId) {
        const tenantFlag = await this.featureFlagRepository.findOne({
          where: { code, tenantId },
        })

        // If tenant-specific override exists, use it
        if (tenantFlag) {
          return tenantFlag.enabled
        }
      }

      // Fall back to global flag (tenantId = NULL)
      const globalFlag = await this.featureFlagRepository.findOne({
        // IsNull(), not null: TypeORM rejects a bare null in a where condition, and the throw is
        // swallowed below as "feature disabled", which 403s every flag-guarded route.
        where: { code, tenantId: IsNull() },
      })

      // Return flag status or default to false
      return globalFlag?.enabled ?? false
    } catch (error) {
      this.logger.error(`Error checking feature flag ${code} for tenant ${tenantId}`, error)
      // Safe default: disable feature on error
      return false
    }
  }

  /**
   * Get all feature flags (global + tenant overrides)
   * @returns Array of all feature flags
   */
  async getAll(): Promise<FeatureFlag[]> {
    return this.featureFlagRepository
      .createQueryBuilder('ff')
      .leftJoinAndSelect('ff.flagCode', 'flagCode')
      .orderBy('flagCode.sort_order', 'ASC')
      .addOrderBy('ff.tenantId', 'ASC')
      .getMany()
  }

  /**
   * Get all feature flags for a specific tenant (including global)
   * @param tenantId - Tenant UUID
   * @returns Object with code => enabled mappings (tenant overrides + global)
   */
  async getFlagsForTenant(tenantId: string): Promise<Record<string, boolean>> {
    // Use QueryBuilder for explicit IS NULL handling
    // This ensures global flags (tenantId IS NULL) are included
    const flags = await this.featureFlagRepository
      .createQueryBuilder('flag')
      .leftJoin('flag.flagCode', 'flagCode')
      .where('flag.tenantId = :tenantId OR flag.tenantId IS NULL', { tenantId })
      .orderBy('flagCode.sort_order', 'ASC')
      .getMany()

    // Build map with tenant overrides taking precedence over global
    const flagMap: Record<string, boolean> = {}

    // First add global flags (tenantId = NULL)
    flags
      .filter((f) => !f.tenantId)
      .forEach((f) => {
        flagMap[f.code] = f.enabled
      })

    // Then override with tenant-specific flags
    flags
      .filter((f) => f.tenantId === tenantId)
      .forEach((f) => {
        flagMap[f.code] = f.enabled
      })

    return flagMap
  }

  /**
   * Create a new feature flag, recording its creation in the history
   * @param dto - Create DTO with code, enabled, tenantId
   * @param actor - Who is creating it
   * @returns Created feature flag entity
   */
  create(dto: CreateFeatureFlagDto, actor: FeatureFlagActor): Promise<FeatureFlag> {
    return this.featureFlagRepository.manager.transaction(async (manager) => {
      const flag = await manager.save(
        manager.create(FeatureFlag, { ...dto, createdBy: actor.id, updatedBy: actor.id }),
      )
      await manager.save(
        manager.create(FeatureFlagHistory, {
          featureFlagId: flag.id,
          code: flag.code,
          tenantId: flag.tenantId ?? null,
          enabled: flag.enabled,
          createdBy: actor.id,
          createdByName: actor.name,
        }),
      )
      return flag
    })
  }

  /**
   * Update an existing feature flag, recording an enable/disable in the history
   * @param id - Feature flag UUID
   * @param dto - Update DTO (enabled, updatedBy)
   * @param actor - Who is making the change
   * @returns Updated feature flag entity
   */
  update(id: string, dto: UpdateFeatureFlagDto, actor: FeatureFlagActor): Promise<FeatureFlag> {
    return this.featureFlagRepository.manager.transaction(async (manager) => {
      // Row lock: two admins making the same change at once (on different pods) would otherwise
      // both read the old value and both record a change.
      const flag = await manager.findOneOrFail(FeatureFlag, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      })
      const wasEnabled = flag.enabled

      if (dto.enabled !== undefined) {
        flag.enabled = dto.enabled
      }

      flag.updatedBy = actor.id
      flag.updatedAt = new Date()

      const saved = await manager.save(flag)

      // A PATCH that sets the value it already had is not a change worth recording.
      if (saved.enabled !== wasEnabled) {
        await manager.save(
          manager.create(FeatureFlagHistory, {
            featureFlagId: id,
            code: saved.code,
            tenantId: saved.tenantId ?? null,
            enabled: saved.enabled,
            createdBy: actor.id,
            createdByName: actor.name,
          }),
        )
      }

      return saved
    })
  }

  /**
   * Get one page of the change history for a feature flag, newest first
   * @param featureFlagId - Feature flag UUID
   * @param page - 1-indexed page number
   * @param limit - Rows per page
   */
  async getHistory(
    featureFlagId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedFeatureFlagHistoryResponse> {
    const [data, count] = await this.historyRepository.findAndCount({
      where: { featureFlagId },
      // id breaks createdAt ties so a row cannot appear on two pages, or on neither.
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    })

    return { data, count, page, limit, totalPages: Math.ceil(count / limit) }
  }

  /**
   * Delete a feature flag (typically a tenant override)
   * @param id - Feature flag UUID
   */
  async delete(id: string): Promise<void> {
    await this.featureFlagRepository.delete(id)
  }

  /**
   * Get a feature flag by ID
   * @param id - Feature flag UUID
   * @returns Feature flag entity or null
   */
  async getById(id: string): Promise<FeatureFlag | null> {
    return this.featureFlagRepository.findOne({ where: { id } })
  }

  /**
   * Get a specific feature flag by code and tenant
   * @param code - Feature code
   * @param tenantId - Tenant UUID (optional, null for global)
   * @returns Feature flag entity or null
   */
  async getByCodeAndTenant(code: string, tenantId?: string): Promise<FeatureFlag | null> {
    return this.featureFlagRepository.findOne({
      where: { code, tenantId: tenantId ?? IsNull() },
    })
  }
}
