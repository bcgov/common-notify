import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { TenantSettings } from './entities/tenant-settings.entity'
import { UpdateSmsSettingsDto } from './schemas/update-sms-settings.dto'
import { UpdateTenantSettingsDto } from './schemas/update-tenant-settings.dto'

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
    dto: UpdateTenantSettingsDto,
    updatedBy?: string,
  ): Promise<TenantSettings> {
    try {
      const existing = await this.findByTenantId(tenantId)

      if (existing) {
        existing.alertEmail = dto.alertEmail
        existing.defaultSenderEmail = dto.defaultSenderEmail
        existing.updatedBy = updatedBy ?? existing.updatedBy

        const savedSettings = await this.tenantSettingsRepository.save(existing)
        this.logger.debug(`Updated tenant settings for tenant: ${tenantId}`)
        return savedSettings
      }

      const settings = this.tenantSettingsRepository.create({
        tenantId,
        alertEmail: dto.alertEmail,
        defaultSenderEmail: dto.defaultSenderEmail,
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

  async upsertSmsSettings(
    tenantId: string,
    dto: UpdateSmsSettingsDto,
    updatedBy?: string,
  ): Promise<TenantSettings> {
    try {
      const existing = await this.findByTenantId(tenantId)

      if (existing) {
        existing.smsNotificationsEnabled = dto.smsNotificationsEnabled
        existing.includeTenantNameInSms = dto.includeTenantNameInSms
        existing.internationalSmsEnabled = dto.internationalSmsEnabled
        existing.updatedBy = updatedBy ?? existing.updatedBy

        const savedSettings = await this.tenantSettingsRepository.save(existing)
        this.logger.debug(`Updated SMS settings for tenant: ${tenantId}`)
        return savedSettings
      }

      const settings = this.tenantSettingsRepository.create({
        tenantId,
        smsNotificationsEnabled: dto.smsNotificationsEnabled,
        includeTenantNameInSms: dto.includeTenantNameInSms,
        internationalSmsEnabled: dto.internationalSmsEnabled,
        createdBy: updatedBy ?? null,
      })

      const savedSettings = await this.tenantSettingsRepository.save(settings)
      this.logger.debug(`Created SMS settings for tenant: ${tenantId}`)
      return savedSettings
    } catch (error) {
      this.logger.error(`Error upserting SMS settings for tenant ${tenantId}: ${error}`)
      throw error
    }
  }
}
