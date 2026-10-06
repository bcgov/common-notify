import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { vi } from 'vitest'
import { EventsFrontendController } from './events-frontend.controller'
import { EventsService } from './events.service'
import { EventListQueryDto } from './schemas/event-list-query.dto'
import { PaginatedEventResponse } from './schemas/paginated-event-response'
import { EventStatus } from '../../enum/event-status.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'

describe('EventsFrontendController', () => {
  let controller: EventsFrontendController

  const tenantId = 'tenant-uuid-1'

  const emptyPage: PaginatedEventResponse = {
    data: [],
    count: 0,
    page: 1,
    limit: 15,
    totalPages: 0,
  }

  const mockEventsService = {
    listEvents: vi.fn(),
    getEvent: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    updateEmailChannelSetting: vi.fn(),
    deactivateEmailChannel: vi.fn(),
    updateSmsChannelSetting: vi.fn(),
    deactivateSmsChannel: vi.fn(),
  }

  // Bypasses authentication and populates request.tenant, mirroring what
  // NotifyFrontendRoleGuard does after validating the tenant against CSTAR.
  const mockAuthGuard: CanActivate = {
    canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest().tenant = { id: tenantId, name: 'Test Tenant' }
      return true
    },
  }

  const createMockRequest = () => ({ tenant: { id: tenantId, name: 'Test Tenant' } }) as any

  /** The list query as the DTO's defaults leave it, plus whatever the test is exercising. */
  const listQuery = (overrides: Partial<EventListQueryDto> = {}): EventListQueryDto =>
    ({ page: 1, limit: 15, ...overrides }) as EventListQueryDto

  /** The `derived` argument the controller handed the service. */
  const derivedArg = () => mockEventsService.listEvents.mock.calls[0][3]

  /** The parsed query the controller handed the service. */
  const parsedQueryArg = () => mockEventsService.listEvents.mock.calls[0][1]

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsFrontendController],
      providers: [{ provide: EventsService, useValue: mockEventsService }],
    })
      .overrideGuard(NotifyFrontendRoleGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(FeatureFlagGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<EventsFrontendController>(EventsFrontendController)

    vi.resetAllMocks()
    mockEventsService.listEvents.mockResolvedValue(emptyPage)
  })

  describe('listEvents', () => {
    it("lists the authenticated tenant's events with no derived filters by default", async () => {
      const result = await controller.listEvents(createMockRequest(), listQuery())

      expect(result).toEqual(emptyPage)
      expect(mockEventsService.listEvents).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ page: 1, limit: 15 }),
        undefined,
        {},
      )
    })

    it('passes the search term through untouched', async () => {
      await controller.listEvents(createMockRequest(), listQuery({ search: '50%_off' }))

      expect(mockEventsService.listEvents.mock.calls[0][2]).toBe('50%_off')
    })

    it('splits channelCodes off as a derived filter', async () => {
      // The generic parser can only filter on columns, and channelCodes is not one - leaving it
      // in would be rejected as an unsupported filter field.
      await controller.listEvents(
        createMockRequest(),
        listQuery({ filter: ['channelCodes:in:EMAIL|SMS'] }),
      )

      expect(derivedArg()).toEqual({
        channelCodes: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      })
      expect(parsedQueryArg().filters).toEqual([])
    })

    it('splits status off as a derived filter', async () => {
      await controller.listEvents(createMockRequest(), listQuery({ filter: ['status:in:DRAFT'] }))

      expect(derivedArg()).toEqual({ statuses: [EventStatus.DRAFT] })
      expect(parsedQueryArg().filters).toEqual([])
    })

    it('accepts eq as well as in for a derived filter', async () => {
      await controller.listEvents(
        createMockRequest(),
        listQuery({ filter: ['status:eq:ACTIVE', 'channelCodes:eq:EMAIL'] }),
      )

      expect(derivedArg()).toEqual({
        statuses: [EventStatus.ACTIVE],
        channelCodes: [NotificationChannel.EMAIL],
      })
    })

    it('splits both derived filters at once', async () => {
      await controller.listEvents(
        createMockRequest(),
        listQuery({ filter: ['channelCodes:in:SMS', 'status:in:ACTIVE|DRAFT'] }),
      )

      expect(derivedArg()).toEqual({
        channelCodes: [NotificationChannel.SMS],
        statuses: [EventStatus.ACTIVE, EventStatus.DRAFT],
      })
    })

    it('passes filters on event columns through to the parser', async () => {
      await controller.listEvents(
        createMockRequest(),
        listQuery({ filter: ['name:like:survey', 'channelCodes:in:EMAIL'] }),
      )

      expect(parsedQueryArg().filters).toEqual([
        { field: 'name', operator: 'like', value: 'survey' },
      ])
      expect(derivedArg()).toEqual({ channelCodes: [NotificationChannel.EMAIL] })
    })

    it('leaves the parser to reject a filter on an unknown field', async () => {
      await expect(
        controller.listEvents(createMockRequest(), listQuery({ filter: ['bogus:eq:1'] })),
      ).rejects.toThrow(/Unsupported filter field/)
      expect(mockEventsService.listEvents).not.toHaveBeenCalled()
    })

    it('rejects an operator the derived filters do not support', async () => {
      await expect(
        controller.listEvents(
          createMockRequest(),
          listQuery({ filter: ['channelCodes:like:EMA'] }),
        ),
      ).rejects.toThrow(BadRequestException)
      expect(mockEventsService.listEvents).not.toHaveBeenCalled()
    })

    it('rejects a derived filter with no value', async () => {
      await expect(
        controller.listEvents(createMockRequest(), listQuery({ filter: ['status:in:'] })),
      ).rejects.toThrow(/missing a value/)
      expect(mockEventsService.listEvents).not.toHaveBeenCalled()
    })

    it('rejects a status value that is not a known status', async () => {
      await expect(
        controller.listEvents(createMockRequest(), listQuery({ filter: ['status:in:ARCHIVED'] })),
      ).rejects.toThrow(/Invalid status value/)
      expect(mockEventsService.listEvents).not.toHaveBeenCalled()
    })

    it('rejects a channel code that is not a channel an event can use', async () => {
      await expect(
        controller.listEvents(
          createMockRequest(),
          listQuery({ filter: ['channelCodes:in:BOGUS'] }),
        ),
      ).rejects.toThrow(/Invalid channel code/)
      expect(mockEventsService.listEvents).not.toHaveBeenCalled()
    })

    it('rejects a channel the events feature does not support', async () => {
      // MSGAPP is a real notification channel, but no event can be configured for it.
      await expect(
        controller.listEvents(
          createMockRequest(),
          listQuery({ filter: ['channelCodes:in:MSGAPP'] }),
        ),
      ).rejects.toThrow(/Invalid channel code/)
    })

    it('upper-cases a channel code, so the filter is case-insensitive like the column ones', async () => {
      await controller.listEvents(
        createMockRequest(),
        listQuery({ filter: ['channelCodes:in:email|sms'] }),
      )

      expect(derivedArg()).toEqual({
        channelCodes: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      })
    })
  })
})
