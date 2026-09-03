import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotifyEvent } from './entities/event.entity'
import { EventChannelSetting } from './entities/event-channel-setting.entity'
import { CreateEventDto } from './schemas/create-event.dto'
import { UpdateEventDto } from './schemas/update-event.dto'
import { UpdateEmailChannelSettingDto } from './schemas/update-email-channel-setting.dto'
import { UpdateSmsChannelSettingDto } from './schemas/update-sms-channel-setting.dto'
import { EventResponseDto } from './schemas/event-response.dto'
import { PaginatedEventResponse } from './schemas/paginated-event-response'
import { EventStatus } from '../../enum/event-status.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { normalizeRecipient } from '../safelist/safelist.util'
import { PhoneNumberService } from '../notify/services/phone-number.service'
import { applyParsedListQueryToQueryBuilder } from '../../common/query/typeorm-list-query.util'
import type { ParsedListQuery, QueryableFieldsConfig } from '../../common/query/list-query.types'

/**
 * Filters on values derived from an event's channel settings rather than stored on the event.
 * Parsed out of the `filter` query param by the controller, because the generic list-query
 * parser can only filter on columns.
 */
export interface DerivedEventFilters {
  channelCodes?: string[]
  statuses?: EventStatus[]
}

export const eventListQueryConfig: QueryableFieldsConfig = {
  sortableFields: {
    name: 'event.name',
    createdAt: 'event.createdAt',
    updatedAt: 'event.updatedAt',
  },
  filterableFields: {
    name: {
      column: 'event.name',
      valueType: 'string',
      operators: ['eq', 'like'],
    },
    description: {
      column: 'event.description',
      valueType: 'string',
      operators: ['like'],
    },
    createdAt: {
      column: 'event.createdAt',
      valueType: 'date',
      operators: ['gte', 'lte'],
    },
  },
  defaultSort: [{ field: 'updatedAt', direction: 'DESC' }],
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(NotifyEvent)
    private readonly eventRepository: Repository<NotifyEvent>,
    @InjectRepository(EventChannelSetting)
    private readonly channelSettingRepository: Repository<EventChannelSetting>,
    private readonly phoneNumberService: PhoneNumberService,
  ) {}

  /**
   * List events for a tenant
   * @param tenantId The tenant ID
   * @param parsedQuery Parsed list query with pagination, sort, and filter
   * @param search Case-insensitive search across name and description
   * @param derived Filters on channel and status, which are derived from channel settings
   */
  async listEvents(
    tenantId: string,
    parsedQuery: ParsedListQuery,
    search?: string,
    derived: DerivedEventFilters = {},
  ): Promise<PaginatedEventResponse> {
    const queryBuilder = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect(
        'event.channelSettings',
        'channelSetting',
        'channelSetting.isDeleted = false',
      )
      .where('event.tenantId = :tenantId', { tenantId })
      .andWhere('event.isDeleted = false')

    // Applied as an OR group since the parsed-query filter mechanism only supports AND.
    if (search) {
      const escaped = search.replace(/[\\%_]/g, '\\$&')
      queryBuilder.andWhere(
        `(event.name ILIKE :search ESCAPE '\\' OR event.description ILIKE :search ESCAPE '\\')`,
        { search: `%${escaped}%` },
      )
    }

    if (derived.channelCodes?.length) {
      const subQuery = this.channelSettingSubQuery('channelFilter').andWhere(
        'channelFilter.channelCode IN (:...filterChannelCodes)',
      )
      queryBuilder.andWhere(`EXISTS (${subQuery.getQuery()})`, {
        filterChannelCodes: derived.channelCodes,
      })
    }

    // Both statuses selected is the same as no status filter, so only a single-status
    // selection narrows the result. Mirrors toResponseDto: ACTIVE means at least one channel
    // is switched on, DRAFT is everything else.
    const statuses = derived.statuses ?? []
    if (statuses.length === 1) {
      const activeSubQuery = this.channelSettingSubQuery('statusFilterActive').andWhere(
        'statusFilterActive.active = true',
      )
      const isActive = `EXISTS (${activeSubQuery.getQuery()})`
      queryBuilder.andWhere(statuses[0] === EventStatus.ACTIVE ? isActive : `NOT ${isActive}`)
    }

    applyParsedListQueryToQueryBuilder(queryBuilder, parsedQuery, eventListQueryConfig)

    const [events, total] = await queryBuilder.getManyAndCount()

    return {
      data: events.map((event) => this.toResponseDto(event)),
      count: total,
      page: parsedQuery.page,
      limit: parsedQuery.limit,
      totalPages: Math.ceil(total / parsedQuery.limit),
    }
  }

  /**
   * Get a specific event
   */
  async getEvent(tenantId: string, eventId: string): Promise<EventResponseDto> {
    const event = await this.findEvent(tenantId, eventId)
    return this.toResponseDto(event)
  }

  /**
   * Create a new event
   * @param tenantId The tenant ID
   * @param createDto Event creation data
   * @param userId User creating the event (for audit trail)
   */
  async createEvent(
    tenantId: string,
    createDto: CreateEventDto,
    userId: string = 'system',
  ): Promise<EventResponseDto> {
    const name = createDto.name.trim()

    const existing = await this.findByName(tenantId, name)
    if (existing) {
      throw new ConflictException(`Event name "${name}" already exists`)
    }

    const event = await this.eventRepository.save(
      this.eventRepository.create({
        tenantId,
        name,
        description: createDto.description ?? null,
        createdBy: userId,
        updatedBy: userId,
      }),
    )

    return this.toResponseDto(event)
  }

  /**
   * Update an event
   * @param tenantId The tenant ID
   * @param eventId The event ID
   * @param updateDto Event update data
   * @param userId User updating the event (for audit trail)
   */
  async updateEvent(
    tenantId: string,
    eventId: string,
    updateDto: UpdateEventDto,
    userId: string = 'system',
  ): Promise<EventResponseDto> {
    const event = await this.findEvent(tenantId, eventId)

    const name = updateDto.name?.trim()
    if (name && name.toLowerCase() !== event.name.trim().toLowerCase()) {
      const existing = await this.findByName(tenantId, name)
      if (existing) {
        throw new ConflictException(`Event name "${name}" already exists`)
      }
    }

    event.name = name || event.name
    event.description = updateDto.description ?? event.description
    event.updatedBy = userId

    const updated = await this.eventRepository.save(event)

    return this.toResponseDto(updated)
  }

  /**
   * Update an event's EMAIL channel settings (Email Notification tab)
   *
   * Creates the channel setting row the first time the tab is saved, so an event only gains an
   * EMAIL row once the user configures one. This is the only path that switches the channel on:
   * the tab's active toggle is local until the settings are applied, so `active` arrives here
   * alongside the data it depends on.
   *
   * @param tenantId The tenant ID
   * @param eventId The event ID
   * @param updateDto Email channel settings, replacing what is stored
   * @param userId User updating the settings (for audit trail)
   */
  async updateEmailChannelSetting(
    tenantId: string,
    eventId: string,
    updateDto: UpdateEmailChannelSettingDto,
    userId: string = 'system',
  ): Promise<EventResponseDto> {
    const event = await this.findEvent(tenantId, eventId)
    const senderEmail = updateDto.senderEmail?.trim() || null
    const templateId = updateDto.templateId ?? null
    const to = this.normalizeEmailList(updateDto.to)
    const cc = this.normalizeEmailList(updateDto.cc)
    const bcc = this.normalizeEmailList(updateDto.bcc)

    const setting = this.findOrCreateEmailSetting(event, userId)

    // Mirrors chk_event_channel_setting_active_complete, checked against the incoming `active`
    // rather than the stored one: switching the channel on requires the settings being saved
    // with it to be complete. An inactive channel can be saved half-filled.
    if (updateDto.active && (!senderEmail || !to || !templateId)) {
      throw new BadRequestException(
        'The email channel cannot be activated until a sender email address, at least one recipient, and a template are set',
      )
    }

    setting.active = updateDto.active
    setting.senderEmail = senderEmail
    setting.templateId = templateId
    setting.to = to
    setting.cc = cc
    setting.bcc = bcc
    setting.isDeleted = false
    setting.updatedBy = userId

    await this.channelSettingRepository.save(setting)

    // Re-read so the derived channelCodes and status reflect the row that was just written.
    return this.getEvent(tenantId, eventId)
  }

  /**
   * Immediately switch an event's EMAIL channel off (the "Channel active" switch turned off),
   * separate from the rest of the tab's settings. There is no matching "switch on" here:
   * activating goes through updateEmailChannelSetting, since that is where the settings
   * activation depends on are supplied.
   *
   * Deactivating a channel that was never configured is a no-op rather than an empty inactive
   * row, so the tab keeps treating it as unconfigured.
   *
   * @param tenantId The tenant ID
   * @param eventId The event ID
   * @param userId User switching the channel off (for audit trail)
   */
  async deactivateEmailChannel(
    tenantId: string,
    eventId: string,
    userId: string = 'system',
  ): Promise<EventResponseDto> {
    const event = await this.findEvent(tenantId, eventId)
    const setting = this.findEmailSetting(event)

    if (!setting) {
      return this.toResponseDto(event)
    }

    setting.active = false
    setting.updatedBy = userId

    await this.channelSettingRepository.save(setting)

    return this.getEvent(tenantId, eventId)
  }

  /**
   * The event's live EMAIL channel setting, or a new unsaved one to populate.
   *
   * uq_event_channel_setting is not partial, so a soft-deleted row still occupies the
   * (event, channel) slot. Reuse and revive it rather than inserting a duplicate.
   */
  private findOrCreateEmailSetting(event: NotifyEvent, userId: string): EventChannelSetting {
    return (
      (event.channelSettings ?? []).find(
        (existing) => existing.channelCode === NotificationChannel.EMAIL,
      ) ??
      this.channelSettingRepository.create({
        eventId: event.id,
        channelCode: NotificationChannel.EMAIL,
        createdBy: userId,
      })
    )
  }

  /**
   * Update an event's SMS channel settings (SMS Notification tab)
   *
   * Creates the channel setting row the first time the tab is saved, so an event only gains an
   * SMS row once the user configures one. This is the only path that switches the channel on:
   * the tab's active toggle is local until the settings are applied, so `active` arrives here
   * alongside the data it depends on.
   *
   * `fromPhoneNumberId` is not settable yet (the pool claim flow is a follow-up), so it stays
   * permanently null - meaning an active SMS channel is not reachable until that flow lands,
   * the same way an EMAIL channel can't be activated without a sender email.
   *
   * @param tenantId The tenant ID
   * @param eventId The event ID
   * @param updateDto SMS channel settings, replacing what is stored
   * @param userId User updating the settings (for audit trail)
   */
  async updateSmsChannelSetting(
    tenantId: string,
    eventId: string,
    updateDto: UpdateSmsChannelSettingDto,
    userId: string = 'system',
  ): Promise<EventResponseDto> {
    const event = await this.findEvent(tenantId, eventId)
    const templateId = updateDto.templateId ?? null
    const to = this.normalizePhoneList(updateDto.to)

    const setting = this.findOrCreateSmsSetting(event, userId)

    // Mirrors chk_event_channel_setting_active_complete, checked against the incoming `active`
    // rather than the stored one: switching the channel on requires the settings being saved
    // with it to be complete. An inactive channel can be saved half-filled.
    if (updateDto.active && (!to || !templateId || !setting.fromPhoneNumberId)) {
      throw new BadRequestException(
        'The SMS channel cannot be activated until a sender phone number, at least one recipient, and a template are set',
      )
    }

    setting.active = updateDto.active
    setting.templateId = templateId
    setting.to = to
    setting.isDeleted = false
    setting.updatedBy = userId

    await this.channelSettingRepository.save(setting)

    // Re-read so the derived channelCodes and status reflect the row that was just written.
    return this.getEvent(tenantId, eventId)
  }

  /**
   * Immediately switch an event's SMS channel off (the "Channel active" switch turned off),
   * separate from the rest of the tab's settings. There is no matching "switch on" here:
   * activating goes through updateSmsChannelSetting, since that is where the settings
   * activation depends on are supplied.
   *
   * Deactivating a channel that was never configured is a no-op rather than an empty inactive
   * row, so the tab keeps treating it as unconfigured.
   *
   * @param tenantId The tenant ID
   * @param eventId The event ID
   * @param userId User switching the channel off (for audit trail)
   */
  async deactivateSmsChannel(
    tenantId: string,
    eventId: string,
    userId: string = 'system',
  ): Promise<EventResponseDto> {
    const event = await this.findEvent(tenantId, eventId)
    const setting = this.findSmsSetting(event)

    if (!setting) {
      return this.toResponseDto(event)
    }

    setting.active = false
    setting.updatedBy = userId

    await this.channelSettingRepository.save(setting)

    return this.getEvent(tenantId, eventId)
  }

  /**
   * The event's live SMS channel setting, or a new unsaved one to populate.
   *
   * uq_event_channel_setting is not partial, so a soft-deleted row still occupies the
   * (event, channel) slot. Reuse and revive it rather than inserting a duplicate.
   */
  private findOrCreateSmsSetting(event: NotifyEvent, userId: string): EventChannelSetting {
    return (
      (event.channelSettings ?? []).find(
        (existing) => existing.channelCode === NotificationChannel.SMS,
      ) ??
      this.channelSettingRepository.create({
        eventId: event.id,
        channelCode: NotificationChannel.SMS,
        createdBy: userId,
      })
    )
  }

  /**
   * Load an event with its channel settings, or throw
   */
  private async findEvent(tenantId: string, eventId: string): Promise<NotifyEvent> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId, tenantId, isDeleted: false },
      relations: ['channelSettings'],
    })

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`)
    }

    return event
  }

  /**
   * Find a live event by name, matching the database's case-insensitive uniqueness rule
   * (uq_event_tenant_name)
   */
  private findByName(tenantId: string, name: string): Promise<NotifyEvent | null> {
    return this.eventRepository
      .createQueryBuilder('event')
      .where('event.tenantId = :tenantId', { tenantId })
      .andWhere('event.isDeleted = false')
      .andWhere('LOWER(BTRIM(event.name)) = LOWER(BTRIM(:name))', { name })
      .getOne()
  }

  /**
   * Correlated "this event's live channel settings" subquery, used by the derived filters
   */
  private channelSettingSubQuery(alias: string) {
    return this.eventRepository.manager
      .createQueryBuilder(EventChannelSetting, alias)
      .select('1')
      .where(`${alias}.eventId = event.id`)
      .andWhere(`${alias}.isDeleted = false`)
  }

  /**
   * Convert an event entity to a response DTO, deriving the channel badges and status
   * from its channel settings
   */
  private toResponseDto(event: NotifyEvent): EventResponseDto {
    const settings = (event.channelSettings ?? []).filter((setting) => !setting.isDeleted)
    // A channel can only be switched on with a complete set of settings, so being active is
    // all that both the Channel badge and the status need to look at.
    const activeChannelCodes = settings
      .filter((setting) => setting.active)
      .map((setting) => setting.channelCode)
    const emailSetting = this.findEmailSetting(event)
    const smsSetting = this.findSmsSetting(event)

    return {
      id: event.id,
      name: event.name,
      description: event.description ?? '',
      channelCodes: activeChannelCodes,
      status: activeChannelCodes.length > 0 ? EventStatus.ACTIVE : EventStatus.DRAFT,
      emailSettings: emailSetting
        ? {
            active: emailSetting.active,
            senderEmail: emailSetting.senderEmail,
            templateId: emailSetting.templateId,
            to: this.splitRecipientList(emailSetting.to),
            cc: this.splitRecipientList(emailSetting.cc),
            bcc: this.splitRecipientList(emailSetting.bcc),
          }
        : null,
      smsSettings: smsSetting
        ? {
            active: smsSetting.active,
            templateId: smsSetting.templateId,
            to: this.splitRecipientList(smsSetting.to),
          }
        : null,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }
  }

  /**
   * The event's live EMAIL channel setting, if it has one
   */
  private findEmailSetting(event: NotifyEvent): EventChannelSetting | undefined {
    return (event.channelSettings ?? []).find(
      (setting) => setting.channelCode === NotificationChannel.EMAIL && !setting.isDeleted,
    )
  }

  /**
   * The event's live SMS channel setting, if it has one
   */
  private findSmsSetting(event: NotifyEvent): EventChannelSetting | undefined {
    return (event.channelSettings ?? []).find(
      (setting) => setting.channelCode === NotificationChannel.SMS && !setting.isDeleted,
    )
  }

  /**
   * Normalizes a list of recipient addresses into the comma-separated form stored in
   * to/cc/bcc, dropping blanks. Returns null when nothing is left, matching
   * chk_event_channel_setting_to/cc/bcc (never an empty string).
   */
  private normalizeEmailList(addresses?: string[]): string | null {
    if (!addresses?.length) return null

    const normalized = addresses
      .map((address) => normalizeRecipient(NotificationChannel.EMAIL, address))
      .filter((address): address is string => !!address)

    return normalized.length > 0 ? normalized.join(',') : null
  }

  /**
   * Normalizes a list of recipient phone numbers to E.164 (default region CA) via
   * PhoneNumberService, dropping blanks and numbers that don't parse. The DTO's
   * IsNormalizablePhoneNumber validator already rejects bad numbers before this runs, so
   * unparseable entries aren't expected here - this mirrors normalizeEmailList's defensive
   * filtering rather than assuming that. HasUniqueNormalizedPhoneNumbers already rejects
   * duplicate numbers before this runs too, so no dedup step is needed here. Returns null when
   * nothing is left, matching chk_event_channel_setting_to (never an empty string).
   */
  private normalizePhoneList(addresses?: string[]): string | null {
    if (!addresses?.length) return null

    const normalized = addresses
      .map((address) => this.phoneNumberService.normalize(address))
      .filter((address): address is string => !!address)

    return normalized.length > 0 ? normalized.join(',') : null
  }

  /**
   * Splits a stored comma-separated to/cc/bcc value back into a list for the API response.
   */
  private splitRecipientList(value: string | null): string[] {
    return value ? value.split(',') : []
  }
}
