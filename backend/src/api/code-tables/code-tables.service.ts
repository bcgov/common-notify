import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationStatusCode } from '../../notification/entities/notification-status-code.entity'
import { NotificationChannelCode } from '../../notification/entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from '../../notification/entities/notification-event-type-code.entity'

export class CodeTableItemDto {
  id: string
  label: string
  description: string
}

export class CodeTablesResponseDto {
  statuses: CodeTableItemDto[]
  channels: CodeTableItemDto[]
  eventTypes: CodeTableItemDto[]
}

@Injectable()
export class CodeTablesService {
  private readonly logger = new Logger(CodeTablesService.name)

  constructor(
    @InjectRepository(NotificationStatusCode)
    private readonly statusCodeRepository: Repository<NotificationStatusCode>,
    @InjectRepository(NotificationChannelCode)
    private readonly channelCodeRepository: Repository<NotificationChannelCode>,
    @InjectRepository(NotificationEventTypeCode)
    private readonly eventTypeCodeRepository: Repository<NotificationEventTypeCode>,
  ) {}

  /**
   * Get all notification status codes
   */
  async getStatuses(): Promise<CodeTableItemDto[]> {
    try {
      const statuses = await this.statusCodeRepository.find({
        order: { code: 'ASC' },
      })
      return statuses.map((s) => ({
        id: s.code,
        label: s.description,
        description: s.code,
      }))
    } catch (error) {
      this.logger.error('Failed to fetch status codes', error)
      throw error
    }
  }

  /**
   * Get all notification channel codes
   */
  async getChannels(): Promise<CodeTableItemDto[]> {
    try {
      const channels = await this.channelCodeRepository.find({
        order: { channelCode: 'ASC' },
      })
      return channels.map((c) => ({
        id: c.channelCode,
        label: c.description,
        description: c.channelCode,
      }))
    } catch (error) {
      this.logger.error('Failed to fetch channel codes', error)
      throw error
    }
  }

  /**
   * Get all notification event type codes
   */
  async getEventTypes(): Promise<CodeTableItemDto[]> {
    try {
      const eventTypes = await this.eventTypeCodeRepository.find({
        order: { eventTypeCode: 'ASC' },
      })
      return eventTypes.map((e) => ({
        id: e.eventTypeCode,
        label: e.description,
        description: e.eventTypeCode,
      }))
    } catch (error) {
      this.logger.error('Failed to fetch event type codes', error)
      throw error
    }
  }

  /**
   * Get all code tables
   */
  async getAllCodeTables(): Promise<CodeTablesResponseDto> {
    const [statuses, channels, eventTypes] = await Promise.all([
      this.getStatuses(),
      this.getChannels(),
      this.getEventTypes(),
    ])

    return {
      statuses,
      channels,
      eventTypes,
    }
  }
}
