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
    const notification = await this.findOne(id, tenantId)
    if (dto.status !== undefined) notification.status = dto.status
    if (dto.updatedBy !== undefined) notification.updatedBy = dto.updatedBy
    const updated = await this.notificationRepository.save(notification)
    this.logger.debug(`Updated notification request: ${id}`)
    return updated
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const notification = await this.findOne(id, tenantId)
    await this.notificationRepository.remove(notification)
    this.logger.debug(`Deleted notification request: ${id}`)
  }
}
