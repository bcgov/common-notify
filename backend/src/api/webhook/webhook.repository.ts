import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { WebhookConfig } from './entities/webhook-config.entity'

@Injectable()
export class WebhookConfigRepository {
  constructor(
    @InjectRepository(WebhookConfig)
    private readonly repo: Repository<WebhookConfig>,
  ) {}

  create(data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    return this.repo.save(this.repo.create(data))
  }

  findById(tenantId: string, id: string): Promise<WebhookConfig | null> {
    return this.repo.findOne({ where: { id, tenantId } })
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<WebhookConfig>,
  ): Promise<WebhookConfig | null> {
    await this.repo.update({ id, tenantId }, data)
    return this.findById(tenantId, id)
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const result = await this.repo.delete({ id, tenantId })
    return (result.affected ?? 0) > 0
  }

  findActiveByTenant(tenantId: string): Promise<WebhookConfig[]> {
    return this.repo.find({ where: { tenantId, active: true } })
  }
}
