import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { EntityManager } from 'typeorm'
import { NotifyEvent } from './entities/event.entity'
import { EventChannelSetting } from './entities/event-channel-setting.entity'
import { EventChannelRecipient } from './entities/event-channel-recipient.entity'
import { EventChannelCstarGroup } from './entities/event-channel-cstar-group.entity'
import { CreateEventDto } from './schemas/create-event.dto'
import { UpdateEventDto } from './schemas/update-event.dto'
import { UpdateEmailChannelSettingDto } from './schemas/update-email-channel-setting.dto'
import { UpdateSmsChannelSettingDto } from './schemas/update-sms-channel-setting.dto'
import { EventResponseDto } from './schemas/event-response.dto'
import { PaginatedEventResponse } from './schemas/paginated-event-response'
import { EventStatus } from '../../enum/event-status.enum'
import { EventRecipientKind } from '../../enum/event-recipient-kind.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { normalizeRecipient } from '../safelist/safelist.util'
import { EmailLogoService } from '../email-logo/email-logo.service'
import { PhoneNumberService } from '../notify/services/phone-number.service'
import { TemplatesRepository } from '../templates/templates.repository'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { applyParsedListQueryToQueryBuilder } from '../../common/query/typeorm-list-query.util'
import type { ParsedListQuery, QueryableFieldsConfig } from '../../common/query/list-query.types'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { CstarGroupListResponseDto } from './schemas/cstar-group-response.dto'

/**
 * Filters on values derived from an event's channel settings rather than stored on the event.
 * Parsed out of the `filter` query param by the controller, because the generic list-query
 * parser can only filter on columns.
 */
export interface DerivedEventFilters {
  channelCodes?: string[]
  statuses?: EventStatus[]
}

/** A recipient as the tab submitted it, normalized and ready to store. */
interface DesiredRecipient {
  kind: EventRecipientKind
  address: string
}

/** A CSTAR group as the tab submitted it, ready to store. One list may hold many. */
interface DesiredCstarGroup {
  kind: EventRecipientKind
  cstarGroupId: string
}

/**
 * The CSTAR tenant the caller is acting in, and the token to reach CSTAR with. Needed to check
 * that the CSTAR group IDs an event is being pointed at actually belong to that tenant, since
 * groups live in CSTAR and cannot be constrained by a foreign key here.
 */
export interface CstarRequestContext {
  /** The CSTAR tenant ID, i.e. notify's tenant.externalId. */
  tenantId: string
  /** The caller's Authorization header, passed through to CSTAR. */
  authHeader?: string
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

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505'

/** Global cap on manually entered recipients per channel, seeded by V62. */
const MAX_RECIPIENTS_KEY = 'event_max_recipients'
const DEFAULT_MAX_RECIPIENTS = 100

/** Fallback for events.senderEmailDomain, matching the domain the Settings tab appends. */
const DEFAULT_SENDER_EMAIL_DOMAIN = 'gov.bc.ca'

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name)

  constructor(
    @InjectRepository(NotifyEvent)
    private readonly eventRepository: Repository<NotifyEvent>,
    @InjectRepository(EventChannelSetting)
    private readonly channelSettingRepository: Repository<EventChannelSetting>,
    @InjectRepository(NotifyConfiguration)
    private readonly configurationRepository: Repository<NotifyConfiguration>,
    private readonly phoneNumberService: PhoneNumberService,
    private readonly emailLogoService: EmailLogoService,
    private readonly templatesRepository: TemplatesRepository,
    private readonly configService: ConfigService,
    private readonly cstarApiClient: CstarApiClient,
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
      .leftJoinAndSelect('channelSetting.recipients', 'recipient', 'recipient.isDeleted = false')
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
      // Only switched-on channels, matching the channelCodes toResponseDto returns - otherwise
      // filtering by a channel turns up events whose Channel badge does not show it.
      const subQuery = this.channelSettingSubQuery('channelFilter')
        .andWhere('channelFilter.active = true')
        .andWhere('channelFilter.channelCode IN (:...filterChannelCodes)')
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

    const event = await this.saveUniquelyNamed(
      this.eventRepository.create({
        tenantId,
        name,
        description: createDto.description ?? null,
        createdBy: userId,
        updatedBy: userId,
      }),
      name,
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

    const updated = await this.saveUniquelyNamed(event, event.name)

    return this.toResponseDto(updated)
  }

  /**
   * The CSTAR groups the tenant can address a notification to, for the group picker on an
   * event's Email settings tab. The browser cannot call CSTAR directly, so this is the
   * lookup behind the proxying controller route.
   *
   * The same list is what updateEmailChannelSetting below validates saved group IDs against.
   *
   * @param cstar CSTAR tenant and token to look the groups up with
   */
  async listCstarGroups(cstar: CstarRequestContext): Promise<CstarGroupListResponseDto> {
    const groups = await this.cstarApiClient.getTenantGroups(cstar.tenantId, cstar.authHeader)

    return {
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description ?? '',
      })),
    }
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
    cstar?: CstarRequestContext,
  ): Promise<EventResponseDto> {
    const event = await this.findEvent(tenantId, eventId)
    const senderEmail = updateDto.senderEmail?.trim() || null
    const templateId = updateDto.templateId ?? null
    const recipients = [
      ...this.toRecipients(EventRecipientKind.TO, this.normalizeEmailAddresses(updateDto.to)),
      ...this.toRecipients(EventRecipientKind.CC, this.normalizeEmailAddresses(updateDto.cc)),
      ...this.toRecipients(EventRecipientKind.BCC, this.normalizeEmailAddresses(updateDto.bcc)),
    ]
    const cstarGroups = [
      ...this.toCstarGroups(
        EventRecipientKind.TO,
        this.normalizeCstarGroupIds(updateDto.cstarGroupIdsTo),
      ),
      ...this.toCstarGroups(
        EventRecipientKind.CC,
        this.normalizeCstarGroupIds(updateDto.cstarGroupIdsCc),
      ),
      ...this.toCstarGroups(
        EventRecipientKind.BCC,
        this.normalizeCstarGroupIds(updateDto.cstarGroupIdsBcc),
      ),
    ]
    // When useCustomHeader is false the header columns stay null and inherit from tenant_settings
    // at render time, so a tenant default title added there later needs no change here.
    const useCustomHeader = updateDto.useCustomHeader ?? false
    const headerLogoId = useCustomHeader ? (updateDto.headerLogoId ?? null) : null
    const headerTitle = useCustomHeader ? updateDto.headerTitle?.trim() || null : null

    if (headerLogoId) {
      const approvedLogo = await this.emailLogoService.findByIdIfApproved(headerLogoId)
      if (!approvedLogo) {
        throw new BadRequestException(
          'headerLogoId must reference an approved, non-deleted email logo',
        )
      }
    }

    this.assertPermittedSenderDomain(senderEmail)
    await this.assertTemplateUsable(tenantId, templateId, NotificationChannel.EMAIL)
    // Groups are deliberately absent from the cap: how many people a group stands for is only
    // known once CSTAR resolves it, which is the send path's job, not this save's.
    await this.assertWithinRecipientCap('email', recipients.length)
    await this.assertCstarGroupsBelongToTenant(cstarGroups, cstar)

    const setting = this.findOrCreateEmailSetting(event, userId)

    // Mirrors chk_event_channel_setting_active_complete, checked against the incoming `active`
    // rather than the stored one: switching the channel on requires the settings being saved
    // with it to be complete. The recipient half is only enforced here, since the constraint
    // cannot see the recipient table. An inactive channel can be saved half-filled.
    if (
      updateDto.active &&
      (!senderEmail || !this.hasToRecipient(recipients, cstarGroups) || !templateId)
    ) {
      throw new BadRequestException(
        'The email channel cannot be activated until a sender email address, at least one recipient (an address or a CSTAR group), and a template are set',
      )
    }

    setting.active = updateDto.active
    setting.senderEmail = senderEmail
    setting.templateId = templateId
    setting.useCustomHeader = useCustomHeader
    setting.headerLogoId = headerLogoId
    setting.headerTitle = headerTitle
    setting.isDeleted = false
    setting.updatedBy = userId

    await this.saveWithRecipients(setting, recipients, userId, cstarGroups)

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
    return this.deactivateChannel(tenantId, eventId, NotificationChannel.EMAIL, userId)
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
    // SMS has no cc/bcc - chk_event_channel_recipient_sms_kind rejects anything but TO.
    const recipients = this.toRecipients(
      EventRecipientKind.TO,
      this.normalizePhoneNumbers(updateDto.to),
    )

    await this.assertTemplateUsable(tenantId, templateId, NotificationChannel.SMS)
    await this.assertWithinRecipientCap('SMS', recipients.length)

    const setting = this.findOrCreateSmsSetting(event, userId)

    // Mirrors chk_event_channel_setting_active_complete, checked against the incoming `active`
    // rather than the stored one: switching the channel on requires the settings being saved
    // with it to be complete. An inactive channel can be saved half-filled.
    if (
      updateDto.active &&
      (!this.hasToRecipient(recipients) || !templateId || !setting.fromPhoneNumberId)
    ) {
      throw new BadRequestException(
        'The SMS channel cannot be activated until a sender phone number, at least one recipient, and a template are set',
      )
    }

    setting.active = updateDto.active
    setting.templateId = templateId
    setting.isDeleted = false
    setting.updatedBy = userId

    await this.saveWithRecipients(setting, recipients, userId)

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
    return this.deactivateChannel(tenantId, eventId, NotificationChannel.SMS, userId)
  }

  /**
   * Switch one of an event's channels off, leaving the rest of its settings in place.
   */
  private async deactivateChannel(
    tenantId: string,
    eventId: string,
    channelCode: NotificationChannel,
    userId: string,
  ): Promise<EventResponseDto> {
    const event = await this.findEvent(tenantId, eventId)
    const setting = this.findSetting(event, channelCode)

    if (!setting) {
      return this.toResponseDto(event)
    }

    setting.active = false
    setting.updatedBy = userId

    await this.channelSettingRepository.save(setting)

    return this.getEvent(tenantId, eventId)
  }

  /**
   * The event's live channel setting for a channel, or a new unsaved one to populate.
   *
   * uq_event_channel_setting is not partial, so a soft-deleted row still occupies the
   * (event, channel) slot. Reuse and revive it rather than inserting a duplicate.
   */
  private findOrCreateSetting(
    event: NotifyEvent,
    channelCode: NotificationChannel,
    userId: string,
  ): EventChannelSetting {
    return (
      (event.channelSettings ?? []).find((existing) => existing.channelCode === channelCode) ??
      this.channelSettingRepository.create({
        eventId: event.id,
        channelCode,
        createdBy: userId,
      })
    )
  }

  private findOrCreateEmailSetting(event: NotifyEvent, userId: string): EventChannelSetting {
    return this.findOrCreateSetting(event, NotificationChannel.EMAIL, userId)
  }

  private findOrCreateSmsSetting(event: NotifyEvent, userId: string): EventChannelSetting {
    return this.findOrCreateSetting(event, NotificationChannel.SMS, userId)
  }

  /**
   * Persist a channel setting and the recipients saved alongside it, as one transaction: a
   * half-written save would leave the channel pointing at the wrong set of people.
   */
  private async saveWithRecipients(
    setting: EventChannelSetting,
    recipients: DesiredRecipient[],
    userId: string,
    cstarGroups: DesiredCstarGroup[] = [],
  ): Promise<void> {
    await this.eventRepository.manager.transaction(async (manager) => {
      const saved = await manager.save(EventChannelSetting, setting)
      await this.syncRecipients(manager, saved, recipients, userId)
      await this.syncCstarGroups(manager, saved, cstarGroups, userId)
    })
  }

  /**
   * Bring a channel's stored recipients in line with what the tab submitted.
   *
   * Removals are soft deletes rather than deletes, so event_channel_recipient_history keeps who
   * was taken off an event. A removed address that comes back revives its own row instead of
   * inserting a second one: uq_event_channel_recipient_active only covers live rows, so two
   * rows for one address would collide the moment both were live.
   */
  private async syncRecipients(
    manager: EntityManager,
    setting: EventChannelSetting,
    desired: DesiredRecipient[],
    userId: string,
  ): Promise<void> {
    const existing = await manager.find(EventChannelRecipient, {
      where: { channelSettingId: setting.id },
    })
    const identity = (kind: EventRecipientKind, address: string) => `${kind}:${address}`
    const desiredKeys = new Set(
      desired.map((recipient) => identity(recipient.kind, recipient.address)),
    )
    const changed: EventChannelRecipient[] = []

    for (const row of existing) {
      if (!row.isDeleted && !desiredKeys.has(identity(row.kind, row.address))) {
        row.isDeleted = true
        row.updatedBy = userId
        changed.push(row)
      }
    }

    for (const recipient of desired) {
      const row = existing.find(
        (candidate) =>
          identity(candidate.kind, candidate.address) ===
          identity(recipient.kind, recipient.address),
      )

      if (!row) {
        changed.push(
          manager.create(EventChannelRecipient, {
            channelSettingId: setting.id,
            channelCode: setting.channelCode,
            kind: recipient.kind,
            address: recipient.address,
            createdBy: userId,
            updatedBy: userId,
          }),
        )
      } else if (row.isDeleted) {
        row.isDeleted = false
        row.updatedBy = userId
        changed.push(row)
      }
    }

    if (changed.length > 0) {
      await manager.save(EventChannelRecipient, changed)
    }
  }

  /**
   * Bring a channel's stored CSTAR groups in line with what the tab submitted.
   *
   * The same diff as syncRecipients, keyed on (kind, group) instead of (kind, address), and for
   * the same reasons: removals are soft deletes so event_channel_cstar_group_history keeps which
   * groups were taken off an event, and a group that comes back revives its own row rather than
   * inserting a second one, since uq_event_channel_cstar_group_active only covers live rows.
   *
   * A field's groups are a set, not a single value, so this adds and removes within a list
   * rather than replacing it.
   */
  private async syncCstarGroups(
    manager: EntityManager,
    setting: EventChannelSetting,
    desired: DesiredCstarGroup[],
    userId: string,
  ): Promise<void> {
    const existing = await manager.find(EventChannelCstarGroup, {
      where: { channelSettingId: setting.id },
    })
    const identity = (kind: EventRecipientKind, cstarGroupId: string) => `${kind}:${cstarGroupId}`
    const desiredKeys = new Set(desired.map((group) => identity(group.kind, group.cstarGroupId)))
    const changed: EventChannelCstarGroup[] = []

    for (const row of existing) {
      if (!row.isDeleted && !desiredKeys.has(identity(row.kind, row.cstarGroupId))) {
        row.isDeleted = true
        row.updatedBy = userId
        changed.push(row)
      }
    }

    for (const group of desired) {
      const row = existing.find(
        (candidate) =>
          identity(candidate.kind, candidate.cstarGroupId) ===
          identity(group.kind, group.cstarGroupId),
      )

      if (!row) {
        changed.push(
          manager.create(EventChannelCstarGroup, {
            channelSettingId: setting.id,
            channelCode: setting.channelCode,
            kind: group.kind,
            cstarGroupId: group.cstarGroupId,
            createdBy: userId,
            updatedBy: userId,
          }),
        )
      } else if (row.isDeleted) {
        row.isDeleted = false
        row.updatedBy = userId
        changed.push(row)
      }
    }

    if (changed.length > 0) {
      await manager.save(EventChannelCstarGroup, changed)
    }
  }

  /**
   * Load an event with its channel settings, their recipients and their CSTAR groups, or throw
   */
  private async findEvent(tenantId: string, eventId: string): Promise<NotifyEvent> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId, tenantId, isDeleted: false },
      relations: ['channelSettings', 'channelSettings.recipients', 'channelSettings.cstarGroups'],
    })

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`)
    }

    return event
  }

  /**
   * Save an event, turning a lost race for its name into the same 409 the pre-check raises.
   *
   * The findByName check cannot hold the rule on its own: two concurrent creates both pass it,
   * and uq_notification_event_tenant_name is what actually rejects the second one.
   */
  private async saveUniquelyNamed(event: NotifyEvent, name: string): Promise<NotifyEvent> {
    try {
      return await this.eventRepository.save(event)
    } catch (error) {
      if ((error as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(`Event name "${name}" already exists`)
      }
      throw error
    }
  }

  /**
   * Find a live event by name, matching the database's case-insensitive uniqueness rule
   * (uq_notification_event_tenant_name)
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
    const emailSetting = this.findSetting(event, NotificationChannel.EMAIL)
    const smsSetting = this.findSetting(event, NotificationChannel.SMS)

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
            to: this.addressesOfKind(emailSetting, EventRecipientKind.TO),
            cc: this.addressesOfKind(emailSetting, EventRecipientKind.CC),
            bcc: this.addressesOfKind(emailSetting, EventRecipientKind.BCC),
            cstarGroupIdsTo: this.groupIdsOfKind(emailSetting, EventRecipientKind.TO),
            cstarGroupIdsCc: this.groupIdsOfKind(emailSetting, EventRecipientKind.CC),
            cstarGroupIdsBcc: this.groupIdsOfKind(emailSetting, EventRecipientKind.BCC),
            useCustomHeader: emailSetting.useCustomHeader,
            headerLogoId: emailSetting.headerLogoId,
            headerTitle: emailSetting.headerTitle,
          }
        : null,
      smsSettings: smsSetting
        ? {
            active: smsSetting.active,
            templateId: smsSetting.templateId,
            to: this.addressesOfKind(smsSetting, EventRecipientKind.TO),
          }
        : null,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }
  }

  /**
   * The event's live channel setting for a channel, if it has one
   */
  private findSetting(
    event: NotifyEvent,
    channelCode: NotificationChannel,
  ): EventChannelSetting | undefined {
    return (event.channelSettings ?? []).find(
      (setting) => setting.channelCode === channelCode && !setting.isDeleted,
    )
  }

  /**
   * A channel's live recipient addresses for one list (to/cc/bcc)
   */
  private addressesOfKind(setting: EventChannelSetting, kind: EventRecipientKind): string[] {
    return (setting.recipients ?? [])
      .filter((recipient) => !recipient.isDeleted && recipient.kind === kind)
      .map((recipient) => recipient.address)
  }

  /**
   * A channel's live CSTAR group IDs for one list (to/cc/bcc). A list can address any number of
   * groups, so this is a set rather than a single value.
   */
  private groupIdsOfKind(setting: EventChannelSetting, kind: EventRecipientKind): string[] {
    return (setting.cstarGroups ?? [])
      .filter((group) => !group.isDeleted && group.kind === kind)
      .map((group) => group.cstarGroupId)
  }

  /** Pairs each address with the list it belongs to. */
  private toRecipients(kind: EventRecipientKind, addresses: string[]): DesiredRecipient[] {
    return addresses.map((address) => ({ kind, address }))
  }

  /** Pairs each CSTAR group with the list it belongs to. */
  private toCstarGroups(kind: EventRecipientKind, groupIds: string[]): DesiredCstarGroup[] {
    return groupIds.map((cstarGroupId) => ({ kind, cstarGroupId }))
  }

  /**
   * Drops blanks and duplicates from a submitted group list.
   *
   * Deduplicated for the same reason addresses are: one group listed twice in a field must not
   * become two rows, which uq_event_channel_cstar_group_active would reject outright. Groups
   * repeated across *different* fields are left alone - that is allowed, exactly as it is for
   * addresses. Overlapping membership between two different groups is not this method's
   * concern: the rows record which groups were chosen, and collapsing the people behind them
   * is the send path's job.
   */
  private normalizeCstarGroupIds(groupIds?: string[]): string[] {
    if (!groupIds?.length) return []

    return [...new Set(groupIds.map((groupId) => groupId.trim()).filter((groupId) => !!groupId))]
  }

  /**
   * Whether the submitted settings address anyone in the "to" list - a typed-in address or a
   * CSTAR group. Either is a complete recipient choice on its own. CC/BCC do not count, for
   * groups as for addresses.
   */
  private hasToRecipient(
    recipients: DesiredRecipient[],
    cstarGroups: DesiredCstarGroup[] = [],
  ): boolean {
    return (
      recipients.some((recipient) => recipient.kind === EventRecipientKind.TO) ||
      cstarGroups.some((group) => group.kind === EventRecipientKind.TO)
    )
  }

  /**
   * Normalizes email addresses to the stored form (lowercased/trimmed), dropping blanks.
   *
   * Deduplicated the way HasUniqueNormalizedPhoneNumbers rejects duplicate SMS numbers: two
   * spellings of one address must not turn into two sends. The database holds the same rule
   * through uq_event_channel_recipient_active; this keeps it a clean save rather than a 409.
   */
  private normalizeEmailAddresses(addresses?: string[]): string[] {
    if (!addresses?.length) return []

    return [
      ...new Set(
        addresses
          .map((address) => normalizeRecipient(NotificationChannel.EMAIL, address))
          .filter((address): address is string => !!address),
      ),
    ]
  }

  /**
   * Normalizes phone numbers to E.164 (default region CA) via PhoneNumberService, dropping
   * blanks and numbers that don't parse. The DTO's IsNormalizablePhoneNumber validator already
   * rejects bad numbers before this runs, so unparseable entries aren't expected here - this
   * mirrors normalizeEmailAddresses' defensive filtering rather than assuming that.
   */
  private normalizePhoneNumbers(addresses?: string[]): string[] {
    if (!addresses?.length) return []

    return [
      ...new Set(
        addresses
          .map((address) => this.phoneNumberService.normalize(address))
          .filter((address): address is string => !!address),
      ),
    ]
  }

  /**
   * Rejects a CSTAR group the event's tenant does not own.
   *
   * cstar_group_id is not a foreign key - groups live in CSTAR and have no table here - so this
   * is the only thing standing between a save and an event quietly addressing another tenant's
   * group. Checked against the same listing the picker is populated from (listCstarGroups), so
   * an ID the UI could offer is an ID that passes here.
   *
   * One CSTAR call per save, and only when groups were actually submitted: an event saved with
   * typed-in addresses alone never reaches CSTAR.
   */
  private async assertCstarGroupsBelongToTenant(
    cstarGroups: DesiredCstarGroup[],
    cstar?: CstarRequestContext,
  ): Promise<void> {
    if (cstarGroups.length === 0) return

    if (!cstar) {
      throw new BadRequestException(
        'CSTAR group recipients cannot be saved without a CSTAR tenant context',
      )
    }

    const tenantGroups = await this.cstarApiClient.getTenantGroups(cstar.tenantId, cstar.authHeader)
    const permitted = new Set(tenantGroups.map((group) => group.id))
    const unknown = [
      ...new Set(
        cstarGroups.map((group) => group.cstarGroupId).filter((groupId) => !permitted.has(groupId)),
      ),
    ]

    if (unknown.length > 0) {
      throw new BadRequestException(
        `CSTAR group(s) ${unknown.join(', ')} do not belong to this tenant`,
      )
    }
  }

  /**
   * Rejects a template the event is not entitled to use.
   *
   * findById already restricts to the tenant's own active templates, so this covers a template
   * belonging to another tenant and one that has been deleted or superseded; the channel check
   * covers selecting an SMS template for the email tab or the reverse. Without this the only
   * thing standing between a save and rendering another tenant's content is the UI's own
   * template list.
   */
  private async assertTemplateUsable(
    tenantId: string,
    templateId: string | null,
    channelCode: NotificationChannel,
  ): Promise<void> {
    if (!templateId) return

    const template = await this.templatesRepository.findById(tenantId, templateId)

    if (!template) {
      throw new BadRequestException(
        'templateId must reference an active template belonging to this tenant',
      )
    }

    if (template.channelCode !== channelCode) {
      throw new BadRequestException(
        `Template "${template.name}" is a ${template.channelCode} template and cannot be used for the ${channelCode} channel`,
      )
    }
  }

  /**
   * Rejects a sender address outside the permitted sending domain.
   *
   * Tenant settings only accept a local part and append this domain, so an event's own sender
   * is held to the same rule rather than being free text - otherwise any template editor could
   * configure an event to send as an address the service has no claim to.
   */
  private assertPermittedSenderDomain(senderEmail: string | null): void {
    if (!senderEmail) return

    const domain = this.senderEmailDomain

    if (senderEmail.toLowerCase().split('@').pop() !== domain.toLowerCase()) {
      throw new BadRequestException(`The sender email address must be an @${domain} address`)
    }
  }

  /** Configured sending domain, falling back to the one the Settings tab appends. */
  private get senderEmailDomain(): string {
    return this.configService.get<string>('events.senderEmailDomain') || DEFAULT_SENDER_EMAIL_DOMAIN
  }

  /**
   * Rejects a save that would store more recipients than the configured cap allows.
   */
  private async assertWithinRecipientCap(channel: string, count: number): Promise<void> {
    const maxRecipients = await this.getMaxRecipients()

    if (count > maxRecipients) {
      throw new BadRequestException(
        `The ${channel} channel accepts at most ${maxRecipients} recipients; this save has ${count}.`,
      )
    }
  }

  /**
   * Global recipient cap from notify.configuration, seeded by V62. Same shape as the safelist's
   * getMaxEntries: an unreadable or nonsensical value falls back to the default rather than
   * failing the save.
   */
  private async getMaxRecipients(): Promise<number> {
    try {
      const row = await this.configurationRepository.findOne({ where: { key: MAX_RECIPIENTS_KEY } })
      const value = Number(row?.config?.value)
      return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_RECIPIENTS
    } catch (error) {
      this.logger.warn(
        `Failed to read ${MAX_RECIPIENTS_KEY} configuration, using default ${DEFAULT_MAX_RECIPIENTS}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return DEFAULT_MAX_RECIPIENTS
    }
  }
}
