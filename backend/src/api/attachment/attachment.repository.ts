import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { AttachmentEntity } from './entities/attachment.entity'

@Injectable()
export class AttachmentRepository {
  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly repo: Repository<AttachmentEntity>,
  ) {}

  create(data: Partial<AttachmentEntity>): Promise<AttachmentEntity> {
    return this.repo.save(this.repo.create(data))
  }

  findByIdAndTenantId(id: string, tenantId: string): Promise<AttachmentEntity | null> {
    return this.repo.findOne({ where: { id, tenantId } })
  }

  findManyByIdsAndTenantId(ids: string[], tenantId: string): Promise<AttachmentEntity[]> {
    if (ids.length === 0) {
      return Promise.resolve([])
    }

    return this.repo.find({
      where: {
        id: In(ids),
        tenantId,
      },
    })
  }

  async deleteByIdAndTenantId(id: string, tenantId: string): Promise<void> {
    await this.repo.delete({ id, tenantId })
  }
}
