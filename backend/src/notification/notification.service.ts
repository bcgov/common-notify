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
    this.logger.log(`[DEBUG-CREATE] Before save - notification object:`, {
      tenantId: notification.tenantId,
      status: notification.status,
      hasPayload: !!notification.payload,
      idBeforeSave: notification.id,
    })
    const saved = await this.notificationRepository.save(notification)
    this.logger.log(`[DEBUG-CREATE] After save - saved notification:`, {
      id: saved.id,
      tenantId: saved.tenantId,
      status: saved.status,
      idType: typeof saved.id,
      idIsNull: saved.id === null,
      idIsUndefined: saved.id === undefined,
    })

    // Immediately verify the record exists in the database
    const verified = await this.notificationRepository.findOne({
      where: { id: saved.id, tenantId: saved.tenantId },
    })
    this.logger.log(
      `[DEBUG-CREATE] Verification query - record ${verified ? 'FOUND' : 'NOT FOUND'}:`,
      {
        queriedId: saved.id,
        queriedTenantId: saved.tenantId,
        found: !!verified,
      },
    )

    this.logger.debug(`Created notification request: ${saved.id}`)
    return saved
  }

  async findAll(tenantId: string): Promise<NotificationRequest[]> {
    return this.notificationRepository.find({ where: { tenantId }, order: { createdAt: 'DESC' } })
  }

  async findOne(id: string, tenantId: string): Promise<NotificationRequest> {
    this.logger.log(
      `[DEBUG-FIND] Looking for notification with id='${id}', tenantId='${tenantId}'`,
      {
        idType: typeof id,
        tenantIdType: typeof tenantId,
        idNull: id === null,
        tenantIdNull: tenantId === null,
      },
    )

    // Try to find with just ID first to debug
    const byIdOnly = await this.notificationRepository.findOne({ where: { id } })
    if (byIdOnly) {
      this.logger.log(`[DEBUG-FIND] Found record with ID alone (no tenantId filter):`, {
        id: byIdOnly.id,
        tenantId: byIdOnly.tenantId,
        status: byIdOnly.status,
      })
    } else {
      this.logger.log(`[DEBUG-FIND] No record found with ID alone`)
    }

    const notification = await this.notificationRepository.findOne({ where: { id, tenantId } })
    if (!notification) {
      this.logger.error(
        `[DEBUG-FIND] Notification NOT found - id='${id}', tenantId='${tenantId}'`,
        {
          id,
          tenantId,
          idMatches: byIdOnly?.id === id,
          tenantIdMatches: byIdOnly?.tenantId === tenantId,
          recordExists: !!byIdOnly,
        },
      )
      throw new NotFoundException(`Notification request with id '${id}' not found`)
    }
    this.logger.log(
      `[DEBUG-FIND] Notification FOUND - id='${notification.id}', status='${notification.status}'`,
    )
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
