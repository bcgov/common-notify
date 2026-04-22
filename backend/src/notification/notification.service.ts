import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationRequest } from './entities/notification-request.entity'
import {
  CreateNotificationRequestDto,
  NotificationStatus,
  UpdateNotificationRequestDto,
} from './schemas'

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    @InjectRepository(NotificationRequest)
    private readonly notificationRepository: Repository<NotificationRequest>,
  ) {}

  async create(dto: CreateNotificationRequestDto): Promise<NotificationRequest> {
    const notification = this.notificationRepository.create({
      tenantId: dto.tenantId,
      status: dto.status ?? NotificationStatus.QUEUED,
      createdBy: dto.createdBy,
      payload: dto.payload,
    })
    const saved = await this.notificationRepository.save(notification)
    this.logger.debug(`Created notification request: ${saved.id}`)
    return saved
  }

  async findAll(tenantId: string): Promise<NotificationRequest[]> {
    return this.notificationRepository.find({ where: { tenantId }, order: { createdAt: 'DESC' } })
  }

  async findOne(id: string, tenantId: string): Promise<NotificationRequest> {
    const notification = await this.notificationRepository.findOne({ where: { id, tenantId } })
    if (!notification) {
      throw new NotFoundException(`Notification request with id '${id}' not found`)
    }
    return notification
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateNotificationRequestDto,
  ): Promise<NotificationRequest> {
    // Verify the record exists first
    await this.findOne(id, tenantId)

    // Build update object with only fields that were provided
    const updateData: any = {}
    if (dto.status !== undefined) updateData.status = dto.status
    if (dto.updatedBy !== undefined) updateData.updatedBy = dto.updatedBy
    if (dto.errorReason !== undefined) updateData.errorReason = dto.errorReason

    // Use query builder for explicit update (status field is part of FK constraint so TypeORM won't track it normally)
    await this.notificationRepository.update({ id, tenantId }, updateData)

    // Fetch and return updated record
    const updated = await this.findOne(id, tenantId)
    this.logger.log(`Updated notification request: ${id}`, { status: dto.status })
    return updated
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const notification = await this.findOne(id, tenantId)
    await this.notificationRepository.remove(notification)
    this.logger.debug(`Deleted notification request: ${id}`)
  }
}
