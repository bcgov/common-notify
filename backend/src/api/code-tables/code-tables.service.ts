import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationStatusCode } from '../notification/entities/notification-status-code.entity'
import { NotificationChannelCode } from '../notification/entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from '../notification/entities/notification-event-type-code.entity'
import { FeatureFlagCode } from '../feature-flag/entities/feature-flag-code.entity'
import { CodeTableDto, CodeTablesResponseDto } from './schemas/code-table.dto'

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
  async getStatuses(): Promise<CodeTableDto[]> {
    try {
      const statuses = await this.statusCodeRepository.find({
        order: { code: 'ASC' },
      })
      return statuses.map((s) => ({
        code: s.code,
        displayName: s.displayName,
        description: s.description,
        createdAt: s.createdAt,
        createdBy: s.createdBy,
        updatedAt: s.updatedAt,
        updatedBy: s.updatedBy,
      }))
    } catch (error) {
      this.logger.error('Failed to fetch status codes', error)
      throw error
    }
  }

  /**
   * Get all notification channel codes
   */
  async getChannels(): Promise<CodeTableDto[]> {
    try {
      const channels = await this.channelCodeRepository.find({
        order: { channelCode: 'ASC' },
      })
      return channels.map((c) => ({
        code: c.channelCode,
        displayName: c.displayName,
        description: c.description,
        createdAt: c.createdAt,
        createdBy: c.createdBy,
        updatedAt: c.updatedAt,
        updatedBy: c.updatedBy,
      }))
    } catch (error) {
      this.logger.error('Failed to fetch channel codes', error)
      throw error
    }
  }

  /**
   * Get all notification event type codes
   */
  async getEventTypes(): Promise<CodeTableDto[]> {
    try {
      const eventTypes = await this.eventTypeCodeRepository.find({
        order: { eventTypeCode: 'ASC' },
      })
      return eventTypes.map((e) => ({
        code: e.eventTypeCode,
        displayName: e.displayName,
        description: e.description,
        createdAt: e.createdAt,
        createdBy: e.createdBy,
        updatedAt: e.updatedAt,
        updatedBy: e.updatedBy,
      }))
    } catch (error) {
      this.logger.error('Failed to fetch event type codes', error)
      throw error
    }
  }

  /**
   * Get all feature flag codes
   */
  async getFeatureCodes(): Promise<CodeTableDto[]> {
    try {
      const featureCodes = await this.featureFlagCodeRepository.find({
        order: { code: 'ASC' },
      })
      return featureCodes.map((f) => ({
        code: f.code,
        displayName: f.displayName,
        description: f.description,
        createdAt: f.createdAt,
        createdBy: f.createdBy,
        updatedAt: f.updatedAt,
        updatedBy: f.updatedBy,
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
