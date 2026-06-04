import { Injectable, NotFoundException } from '@nestjs/common'
import { WebhookConfigRepository } from './webhook.repository'
import { WebhookDeliveryLogRepository } from './webhook-delivery-log.repository'
import { WebhookConfig } from './entities/webhook-config.entity'
import { EncryptionService } from './encryption.service'
import {
  CallbackRegistrationRequest,
  CallbackRegistrationResponse,
} from './schemas/callback-registration.dto'

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
    createdBy?: string,
  ): Promise<CallbackRegistrationResponse> {
    const config = await this.webhookConfigRepository.create({
      tenantId,
      url: dto.url!,
      secret: dto.secret ? this.encryptionService.encrypt(dto.secret) : undefined,
      headers: dto.headers,
      active: dto.active ?? true,
      triggerOn: {
        channelType: dto.channelType ?? [],
        trigger: dto.trigger ?? [],
      },
      createdBy,
      updatedBy: createdBy,
    })
    return this.toResponse(this.decryptConfig(config))
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

    const currentTriggerOn = (existing.triggerOn ?? {}) as Record<string, unknown>
    const updatedTriggerOn: Record<string, unknown> = {
      ...currentTriggerOn,
      ...(dto.channelType !== undefined && { channelType: dto.channelType }),
      ...(dto.trigger !== undefined && { trigger: dto.trigger }),
    }

    const updated = await this.webhookConfigRepository.update(tenantId, id, {
      ...(dto.url !== undefined && { url: dto.url }),
      ...(dto.secret !== undefined && { secret: this.encryptionService.encrypt(dto.secret) }),
      ...(dto.headers !== undefined && { headers: dto.headers }),
      ...(dto.active !== undefined && { active: dto.active }),
      triggerOn: updatedTriggerOn,
    })
    return this.toResponse(this.decryptConfig(updated!))
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const deleted = await this.webhookConfigRepository.delete(tenantId, id)
    if (!deleted) {
      throw new NotFoundException(`Callback '${id}' not found`)
    }
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
    const triggerOn = (config.triggerOn ?? {}) as Record<string, unknown>
    return {
      callbackId: config.id,
      url: config.url,
      secret: config.secret,
      headers: config.headers,
      channelType: (triggerOn.channelType as string[]) ?? [],
      trigger: (triggerOn.trigger as string[]) ?? [],
      active: config.active,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }
  }
}
