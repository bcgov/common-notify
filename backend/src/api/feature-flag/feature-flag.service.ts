import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FeatureFlag } from './entities/feature-flag.entity'
import { CreateFeatureFlagDto } from './schemas/create-feature-flag.dto'
import { UpdateFeatureFlagDto } from './schemas/update-feature-flag.dto'

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
@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name)

  constructor(
    @InjectRepository(FeatureFlag)
    private readonly featureFlagRepository: Repository<FeatureFlag>,
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
        where: { code, tenantId: null },
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
      .orderBy('ff.code', 'ASC')
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
      .where('flag.tenantId = :tenantId OR flag.tenantId IS NULL', { tenantId })
      .orderBy('flag.code', 'ASC')
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
   * Create a new feature flag
   * @param dto - Create DTO with code, enabled, tenantId
   * @param userId - User ID for audit trail
   * @returns Created feature flag entity
   */
  async create(dto: CreateFeatureFlagDto, userId: string): Promise<FeatureFlag> {
    const flag = this.featureFlagRepository.create({
      ...dto,
      createdBy: userId,
      updatedBy: userId,
    })

    return this.featureFlagRepository.save(flag)
  }

  /**
   * Update an existing feature flag
   * @param id - Feature flag UUID
   * @param dto - Update DTO (enabled, updatedBy)
   * @param userId - User ID for audit trail
   * @returns Updated feature flag entity
   */
  async update(id: string, dto: UpdateFeatureFlagDto, userId: string): Promise<FeatureFlag> {
    const flag = await this.featureFlagRepository.findOneOrFail({ where: { id } })

    if (dto.enabled !== undefined) {
      flag.enabled = dto.enabled
    }

    flag.updatedBy = userId
    flag.updatedAt = new Date()

    return this.featureFlagRepository.save(flag)
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
      where: { code, tenantId: tenantId ?? null },
    })
  }
}
