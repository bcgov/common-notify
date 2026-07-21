import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { TenantSettings } from './entities/tenant-settings.entity'

@Injectable()
export class TenantSettingsService {
  private readonly logger = new Logger(TenantSettingsService.name)

  constructor(
    @InjectRepository(TenantSettings)
    private tenantSettingsRepository: Repository<TenantSettings>,
  ) {}

  async findByTenantId(tenantId: string): Promise<TenantSettings | null> {
    return this.tenantSettingsRepository.findOne({ where: { tenantId } })
  }

  async upsert(
    tenantId: string,
    alertEmail: string | null,
    updatedBy?: string,
  ): Promise<TenantSettings> {
    try {
      const existing = await this.findByTenantId(tenantId)

      if (existing) {
        existing.alertEmail = alertEmail
        existing.updatedBy = updatedBy ?? existing.updatedBy

        const savedSettings = await this.tenantSettingsRepository.save(existing)
        this.logger.debug(`Updated tenant settings for tenant: ${tenantId}`)
        return savedSettings
      }

      const settings = this.tenantSettingsRepository.create({
        tenantId,
        alertEmail,
        createdBy: updatedBy ?? null,
      })

      const savedSettings = await this.tenantSettingsRepository.save(settings)
      this.logger.debug(`Created tenant settings for tenant: ${tenantId}`)
      return savedSettings
    } catch (error) {
      this.logger.error(`Error upserting tenant settings for tenant ${tenantId}: ${error}`)
      throw error
    }
  }
}
