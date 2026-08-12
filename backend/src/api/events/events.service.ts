import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotifyEvent } from './entities/event.entity'
import { EventChannelSetting } from './entities/event-channel-setting.entity'
import { CreateEventDto } from './schemas/create-event.dto'
import { UpdateEventDto } from './schemas/update-event.dto'
import { EventResponseDto } from './schemas/event-response.dto'
import { PaginatedEventResponse } from './schemas/paginated-event-response'
import { EventStatus } from '../../enum/event-status.enum'
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
    // selection narrows the result.
    const statuses = derived.statuses ?? []
    if (statuses.length === 1) {
      const subQuery = this.channelSettingSubQuery('statusFilter').andWhere(
        'statusFilter.active = true',
      )
      const exists = `EXISTS (${subQuery.getQuery()})`
      queryBuilder.andWhere(statuses[0] === EventStatus.ACTIVE ? exists : `NOT ${exists}`)
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

    return {
      id: event.id,
      name: event.name,
      description: event.description ?? '',
      channelCodes: settings.map((setting) => setting.channelCode),
      status: settings.some((setting) => setting.active) ? EventStatus.ACTIVE : EventStatus.DRAFT,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }
  }
}
