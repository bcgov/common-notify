import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationStatusCode } from '../notification/entities/notification-status-code.entity'
import { NotificationChannelCode } from '../notification/entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from '../notification/entities/notification-event-type-code.entity'
import { FeatureFlagCode } from '../feature-flag/entities/feature-flag-code.entity'

export class CodeTableItemDto {
  id: string
  label: string
  description: string
}

export class CodeTablesResponseDto {
  statuses: CodeTableItemDto[]
  channels: CodeTableItemDto[]
  eventTypes: CodeTableItemDto[]
  featureFlags: CodeTableItemDto[]
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
    @InjectRepository(FeatureFlagCode)
    private readonly featureFlagCodeRepository: Repository<FeatureFlagCode>,
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
        label: s.displayName || s.description,
        description: s.description,
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
        label: c.displayName || c.description,
        description: c.description,
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
        label: e.displayName || e.description,
        description: e.description,
      }))
    } catch (error) {
      this.logger.error('Failed to fetch event type codes', error)
      throw error
    }
  }

  /**
   * Get all feature flag codes
   */
  async getFeatureCodes(): Promise<CodeTableItemDto[]> {
    try {
      const featureCodes = await this.featureFlagCodeRepository.find({
        order: { code: 'ASC' },
      })
      return featureCodes.map((f) => ({
        id: f.code,
        label: f.displayName,
        description: f.description,
      }))
    } catch (error) {
      this.logger.error('Failed to fetch feature flag codes', error)
      throw error
    }
  }

  /**
   * Get all code tables
   */
  async getAllCodeTables(): Promise<CodeTablesResponseDto> {
    const [statuses, channels, eventTypes, featureFlags] = await Promise.all([
      this.getStatuses(),
      this.getChannels(),
      this.getEventTypes(),
      this.getFeatureCodes(),
    ])

    return {
      statuses,
      channels,
      eventTypes,
      featureFlags,
    }
  }
}
