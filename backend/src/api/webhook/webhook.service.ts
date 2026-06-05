import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { WebhookConfigRepository } from './webhook.repository'
import { WebhookDeliveryLogRepository } from './webhook-delivery-log.repository'
import { WebhookConfig } from './entities/webhook-config.entity'
import { EncryptionService } from './encryption.service'
import {
  CallbackRegistrationRequest,
  CallbackRegistrationResponse,
} from './schemas/callback-registration.dto'
import { WebhookType } from '../../enum/webhook-type.enum'

@Injectable()
export class WebhookService {
  constructor(
    private readonly webhookConfigRepository: WebhookConfigRepository,
    private readonly webhookDeliveryLogRepository: WebhookDeliveryLogRepository,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(
    tenantId: string,
    dto: CallbackRegistrationRequest,
  ): Promise<CallbackRegistrationResponse> {
    try {
      const config = await this.webhookConfigRepository.create({
        tenantId,
        url: dto.url!,
        secret: dto.secret ? this.encryptionService.encrypt(dto.secret) : undefined,
        headers: dto.headers,
        active: dto.active ?? true,
        webhookType: dto.webhookType ?? WebhookType.GENERIC,
        channelType: dto.channelType ?? [],
        triggerOn: dto.trigger ?? [],
        createdBy: tenantId,
        updatedBy: tenantId,
      })
      return this.toResponse(this.decryptConfig(config))
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new BadRequestException(
          `A callback for URL '${dto.url}' already exists for this tenant`,
        )
      }
      throw err
    }
  }

  async update(
    tenantId: string,
    id: string,
    dto: CallbackRegistrationRequest,
  ): Promise<CallbackRegistrationResponse> {
    const existing = await this.webhookConfigRepository.findById(tenantId, id)
    if (!existing) {
      throw new NotFoundException(`Callback '${id}' not found`)
    }

    try {
      const updated = await this.webhookConfigRepository.update(tenantId, id, {
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.secret !== undefined && { secret: this.encryptionService.encrypt(dto.secret) }),
        ...(dto.headers !== undefined && { headers: dto.headers }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.webhookType !== undefined && { webhookType: dto.webhookType }),
        ...(dto.channelType !== undefined && { channelType: dto.channelType }),
        ...(dto.trigger !== undefined && { triggerOn: dto.trigger }),
      })
      return this.toResponse(this.decryptConfig(updated!))
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new BadRequestException(
          `A callback for URL '${dto.url}' already exists for this tenant`,
        )
      }
      throw err
    }
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const existing = await this.webhookConfigRepository.findById(tenantId, id)
    if (!existing) {
      throw new NotFoundException(`Callback '${id}' not found`)
    }
    await this.webhookConfigRepository.delete(tenantId, id)
  }

  async findById(tenantId: string, id: string): Promise<WebhookConfig | null> {
    const config = await this.webhookConfigRepository.findById(tenantId, id)
    return config ? this.decryptConfig(config) : null
  }

  async findActiveByTenant(tenantId: string): Promise<WebhookConfig[]> {
    const configs = await this.webhookConfigRepository.findActiveByTenant(tenantId)
    return configs.map((c) => this.decryptConfig(c))
  }

  getDeliveryLogRepository(): WebhookDeliveryLogRepository {
    return this.webhookDeliveryLogRepository
  }

  private decryptConfig(config: WebhookConfig): WebhookConfig {
    if (!config.secret) return config
    return { ...config, secret: this.encryptionService.decrypt(config.secret) }
  }

  private toResponse(config: WebhookConfig): CallbackRegistrationResponse {
    return {
      callbackId: config.id,
      url: config.url,
      secret: config.secret,
      headers: config.headers,
      channelType: config.channelType,
      trigger: config.triggerOn ?? [],
      active: config.active,
      webhookType: config.webhookType ?? WebhookType.GENERIC,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }
  }
}
