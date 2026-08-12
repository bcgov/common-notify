import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import * as express from 'express'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'
import { CstarRole as CstarRoleEnum } from '../../enum/cstar-role.enum'
import { EventStatus } from '../../enum/event-status.enum'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { JwtUserExtractor } from '../../common/utils/jwt-user-extractor'
import { EventsService, eventListQueryConfig } from './events.service'
import type { DerivedEventFilters } from './events.service'
import { CreateEventDto } from './schemas/create-event.dto'
import { UpdateEventDto } from './schemas/update-event.dto'
import { EventResponseDto } from './schemas/event-response.dto'
import { EventListQueryDto } from './schemas/event-list-query.dto'
import { PaginatedEventResponse } from './schemas/paginated-event-response'
import { parseListQuery } from '../../common/query/list-query.parser'

/**
 * Frontend Events API Controller
 *
 * Serves /api/v1/frontend/events for the Events list and the Create/Edit Event pages.
 *
 * Gated by a feature flag for now.
 */
@ApiTags('events')
@Controller('frontend/events')
@UseGuards(NotifyFrontendRoleGuard, FeatureFlagGuard)
@FeatureFlag(FeatureFlagCode.EVENTS)
@ApiBearerAuth()
export class EventsFrontendController {
  constructor(private readonly eventsService: EventsService) {}

  /**
   * List events for the tenant
   *
   * @param req Request, used to resolve the authenticated tenant context
   * @param query List query parameters (pagination, sort, filter, search)
   * @returns Paginated list of events
   */
  @Version('1')
  @Get()
  @HttpCode(200)
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({ summary: 'List all events for the authenticated tenant' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (1-indexed)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 15,
    description: 'Items per page (max 100)',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    type: String,
    example: '-updatedAt,name',
    description: 'Sort fields separated by commas. Prefix with - for DESC.',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    isArray: true,
    example: ['channelCodes:in:EMAIL|SMS', 'status:in:DRAFT'],
    description:
      'Filters using field:operator:value. Repeat query param for multiple filters. ' +
      'channelCodes and status match against the event channel settings.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'survey',
    description: 'Case-insensitive search across event name and description.',
  })
  @ApiOkResponse({ type: PaginatedEventResponse })
  async listEvents(
    @Req() req: Request,
    @Query() query: EventListQueryDto,
  ): Promise<PaginatedEventResponse> {
    const tenant = this.getTenant(req)
    const { filter, derived } = this.splitDerivedFilters(query.filter)
    const parsedQuery = parseListQuery({ ...query, filter }, eventListQueryConfig)
    return this.eventsService.listEvents(tenant.id, parsedQuery, query.search, derived)
  }

  /**
   * Get a specific event by ID
   */
  @Version('1')
  @Get(':eventId')
  @HttpCode(200)
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({ summary: 'Get a single event' })
  @ApiOkResponse({ type: EventResponseDto })
  async getEvent(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<EventResponseDto> {
    const tenant = this.getTenant(req)
    return this.eventsService.getEvent(tenant.id, eventId)
  }

  /**
   * Create a new event
   */
  @Version('1')
  @Post()
  @HttpCode(201)
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Create an event' })
  @ApiOkResponse({ type: EventResponseDto })
  async createEvent(
    @Req() req: express.Request,
    @Body() createEventDto: CreateEventDto,
  ): Promise<EventResponseDto> {
    const tenant = this.getTenant(req)
    const user = JwtUserExtractor.extractUser(req)
    return this.eventsService.createEvent(tenant.id, createEventDto, user)
  }

  /**
   * Update an existing event
   */
  @Version('1')
  @Post(':eventId')
  @HttpCode(200)
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Update an event' })
  @ApiOkResponse({ type: EventResponseDto })
  async updateEvent(
    @Req() req: express.Request,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() updateEventDto: UpdateEventDto,
  ): Promise<EventResponseDto> {
    const tenant = this.getTenant(req)
    const user = JwtUserExtractor.extractUser(req)
    return this.eventsService.updateEvent(tenant.id, eventId, updateEventDto, user)
  }

  private getTenant(req: Request | express.Request): Tenant {
    return (req as any).tenant as Tenant
  }

  /**
   * Split the `filter` params into the ones the generic parser can handle (event columns)
   * and the ones derived from channel settings, which the service applies itself.
   *
   * Channel codes are derived from linked active event channel settings rows, status is also derived.
   */
  private splitDerivedFilters(filters?: string[]): {
    filter?: string[]
    derived: DerivedEventFilters
  } {
    if (!filters?.length) {
      return { filter: filters, derived: {} }
    }

    const remaining: string[] = []
    const derived: DerivedEventFilters = {}

    for (const token of filters) {
      const [field, operator, ...valueParts] = token.split(':')

      if (field !== 'channelCodes' && field !== 'status') {
        remaining.push(token)
        continue
      }

      if (operator !== 'eq' && operator !== 'in') {
        throw new BadRequestException(`Unsupported operator '${operator}' for field '${field}'`)
      }

      const values = valueParts.join(':').split('|').filter(Boolean)
      if (values.length === 0) {
        throw new BadRequestException(`Filter '${token}' is missing a value`)
      }

      if (field === 'channelCodes') {
        derived.channelCodes = [...(derived.channelCodes ?? []), ...values]
        continue
      }

      const statuses = values.map((value) => {
        if (!Object.values(EventStatus).includes(value as EventStatus)) {
          throw new BadRequestException(`Invalid status value: '${value}'`)
        }
        return value as EventStatus
      })
      derived.statuses = [...(derived.statuses ?? []), ...statuses]
    }

    return { filter: remaining, derived }
  }
}
