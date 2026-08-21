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
import { UpdateEmailChannelSettingDto } from './schemas/update-email-channel-setting.dto'
import { UpdateEmailChannelDraftDto } from './schemas/update-email-channel-draft.dto'
import { UpdateEmailChannelActiveDto } from './schemas/update-email-channel-active.dto'
import { UpdateSmsChannelSettingDto } from './schemas/update-sms-channel-setting.dto'
import { UpdateSmsChannelDraftDto } from './schemas/update-sms-channel-draft.dto'
import { UpdateSmsChannelActiveDto } from './schemas/update-sms-channel-active.dto'
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

  /**
   * Update an event's email channel settings (Email Notification tab)
   */
  @Version('1')
  @Post(':eventId/channels/email')
  @HttpCode(200)
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Update an event's email channel settings" })
  @ApiOkResponse({ type: EventResponseDto })
  async updateEmailChannelSetting(
    @Req() req: express.Request,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() updateDto: UpdateEmailChannelSettingDto,
  ): Promise<EventResponseDto> {
    const tenant = this.getTenant(req)
    const user = JwtUserExtractor.extractUser(req)
    return this.eventsService.updateEmailChannelSetting(tenant.id, eventId, updateDto, user)
  }

  /**
   * Save an event's email channel settings as a draft (Save draft on the Email Notification tab)
   *
   * Bypasses the null/empty validation of updateEmailChannelSetting so a partially filled-in
   * form can be saved. `active` is always honored directly - the channel can be saved as
   * active ahead of the data being complete, since chk_event_channel_setting_active_complete
   * exempts draft rows.
   */
  @Version('1')
  @Post(':eventId/channels/email/draft')
  @HttpCode(200)
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Save an event's email channel settings as a draft" })
  @ApiOkResponse({ type: EventResponseDto })
  async updateEmailChannelDraft(
    @Req() req: express.Request,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() updateDto: UpdateEmailChannelDraftDto,
  ): Promise<EventResponseDto> {
    const tenant = this.getTenant(req)
    const user = JwtUserExtractor.extractUser(req)
    return this.eventsService.updateEmailChannelDraft(tenant.id, eventId, updateDto, user)
  }

  /**
   * Immediately toggle an event's EMAIL channel on/off (the "Channel active" switch), separate
   * from the rest of the Email Notification tab's settings.
   */
  @Version('1')
  @Post(':eventId/channels/email/active')
  @HttpCode(200)
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Toggle an event's email channel active state" })
  @ApiOkResponse({ type: EventResponseDto })
  async updateEmailChannelActive(
    @Req() req: express.Request,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() updateDto: UpdateEmailChannelActiveDto,
  ): Promise<EventResponseDto> {
    const tenant = this.getTenant(req)
    const user = JwtUserExtractor.extractUser(req)
    return this.eventsService.updateEmailChannelActive(tenant.id, eventId, updateDto, user)
  }

  /**
   * Update an event's SMS channel settings (SMS Notification tab)
   */
  @Version('1')
  @Post(':eventId/channels/sms')
  @HttpCode(200)
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Update an event's SMS channel settings" })
  @ApiOkResponse({ type: EventResponseDto })
  async updateSmsChannelSetting(
    @Req() req: express.Request,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() updateDto: UpdateSmsChannelSettingDto,
  ): Promise<EventResponseDto> {
    const tenant = this.getTenant(req)
    const user = JwtUserExtractor.extractUser(req)
    return this.eventsService.updateSmsChannelSetting(tenant.id, eventId, updateDto, user)
  }

  /**
   * Save an event's SMS channel settings as a draft (Save draft on the SMS Notification tab)
   *
   * Bypasses the null/empty validation of updateSmsChannelSetting so a partially filled-in
   * form can be saved. `active` is always honored directly - the channel can be saved as
   * active ahead of the data being complete, since chk_event_channel_setting_active_complete
   * exempts draft rows.
   */
  @Version('1')
  @Post(':eventId/channels/sms/draft')
  @HttpCode(200)
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Save an event's SMS channel settings as a draft" })
  @ApiOkResponse({ type: EventResponseDto })
  async updateSmsChannelDraft(
    @Req() req: express.Request,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() updateDto: UpdateSmsChannelDraftDto,
  ): Promise<EventResponseDto> {
    const tenant = this.getTenant(req)
    const user = JwtUserExtractor.extractUser(req)
    return this.eventsService.updateSmsChannelDraft(tenant.id, eventId, updateDto, user)
  }

  /**
   * Immediately toggle an event's SMS channel on/off (the "Channel active" switch), separate
   * from the rest of the SMS Notification tab's settings.
   */
  @Version('1')
  @Post(':eventId/channels/sms/active')
  @HttpCode(200)
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Toggle an event's SMS channel active state" })
  @ApiOkResponse({ type: EventResponseDto })
  async updateSmsChannelActive(
    @Req() req: express.Request,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() updateDto: UpdateSmsChannelActiveDto,
  ): Promise<EventResponseDto> {
    const tenant = this.getTenant(req)
    const user = JwtUserExtractor.extractUser(req)
    return this.eventsService.updateSmsChannelActive(tenant.id, eventId, updateDto, user)
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
