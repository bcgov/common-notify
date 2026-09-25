import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EmailLogoService } from '../email-logo/email-logo.service'
import { TenantSettings } from './entities/tenant-settings.entity'
import { UpdateEmailSettingsDto } from './schemas/update-email-settings.dto'
import { UpdateSmsSettingsDto } from './schemas/update-sms-settings.dto'
import { UpdateTenantSettingsDto } from './schemas/update-tenant-settings.dto'

@Injectable()
export class TenantSettingsService {
  private readonly logger = new Logger(TenantSettingsService.name)

  constructor(
    @InjectRepository(TenantSettings)
    private tenantSettingsRepository: Repository<TenantSettings>,
    private readonly emailLogoService: EmailLogoService,
    private readonly configService: ConfigService,
  ) {}

  async findByTenantId(tenantId: string): Promise<TenantSettings | null> {
    return this.tenantSettingsRepository.findOne({ where: { tenantId } })
  }

  /**
   * The address this tenant's email is sent from, or null to fall back to the service-wide
   * `ches.from`.
   *
   * `default_sender_email` holds only the local part - the Settings tab appends the domain when
   * it shows the field - so the domain is put back here from the same config value an event's
   * own sender address is held to.
   */
  async getSenderAddress(tenantId: string): Promise<string | null> {
    const settings = await this.findByTenantId(tenantId)
    const localPart = settings?.defaultSenderEmail?.trim()
    if (!localPart) {
      return null
    }

    const domain = this.configService.get<string>('events.senderEmailDomain') || 'gov.bc.ca'
    return `${localPart}@${domain}`
  }

  /**
   * The address a send from this tenant will actually come from: its own configured sender, else
   * the service-wide default the email transports fall back to. One resolution, so a response or
   * a preview that reports the sender cannot drift from the address delivery uses.
   */
  async resolveSenderAddress(tenantId: string): Promise<string> {
    return (
      (await this.getSenderAddress(tenantId)) ??
      this.configService.get<string>('ches.from') ??
      this.configService.get<string>('defaults.email.from')
    )
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

  async upsertEmailSettings(
    tenantId: string,
    dto: UpdateEmailSettingsDto,
    updatedBy?: string,
  ): Promise<TenantSettings> {
    try {
      if (dto.emailLogoId !== null) {
        const approvedLogo = await this.emailLogoService.findByIdIfApproved(dto.emailLogoId)
        if (!approvedLogo) {
          throw new BadRequestException(
            'emailLogoId must reference an approved, non-deleted email logo',
          )
        }
      }

      const existing = await this.findByTenantId(tenantId)

      if (existing) {
        existing.emailLogoId = dto.emailLogoId
        existing.emailNotificationsEnabled = dto.emailNotificationsEnabled
        existing.replyToEmail = dto.replyToEmail
        existing.emailAttachmentsEnabled = dto.emailAttachmentsEnabled
        existing.updatedBy = updatedBy ?? existing.updatedBy

        const savedSettings = await this.tenantSettingsRepository.save(existing)
        this.logger.debug(`Updated email settings for tenant: ${tenantId}`)
        return savedSettings
      }

      const settings = this.tenantSettingsRepository.create({
        tenantId,
        emailLogoId: dto.emailLogoId,
        emailNotificationsEnabled: dto.emailNotificationsEnabled,
        replyToEmail: dto.replyToEmail,
        emailAttachmentsEnabled: dto.emailAttachmentsEnabled,
        createdBy: updatedBy ?? null,
      })

      const savedSettings = await this.tenantSettingsRepository.save(settings)
      this.logger.debug(`Created email settings for tenant: ${tenantId}`)
      return savedSettings
    } catch (error) {
      this.logger.error(`Error upserting email settings for tenant ${tenantId}: ${error}`)
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
