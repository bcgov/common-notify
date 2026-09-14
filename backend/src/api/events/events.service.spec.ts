import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { vi } from 'vitest'
import { EventsService } from './events.service'
import { NotifyEvent } from './entities/event.entity'
import { EventChannelSetting } from './entities/event-channel-setting.entity'
import { EventChannelRecipient } from './entities/event-channel-recipient.entity'
import { EventStatus } from '../../enum/event-status.enum'
import { EventRecipientKind } from '../../enum/event-recipient-kind.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { EmailLogoService } from '../email-logo/email-logo.service'
import { PhoneNumberService } from '../notify/services/phone-number.service'
import { TemplatesRepository } from '../templates/templates.repository'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import type { ParsedListQuery } from '../../common/query/list-query.types'

describe('EventsService', () => {
  let service: EventsService

  const tenantId = 'tenant-uuid-1'
  const eventId = 'event-uuid-1'
  const logoId = 'logo-uuid-1'
  const templateId = 'template-uuid-1'
  const settingId = 'setting-uuid-1'

  const buildEvent = (channelSettings: Partial<EventChannelSetting>[] = []): NotifyEvent =>
    ({
      id: eventId,
      tenantId,
      name: 'Graduates Outcome Survey',
      description: 'Sent to graduates',
      channelSettings,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    }) as NotifyEvent

  const buildRecipient = (
    kind: EventRecipientKind,
    address: string,
    overrides: Partial<EventChannelRecipient> = {},
  ): EventChannelRecipient =>
    ({
      id: `recipient-${kind}-${address}`,
      channelSettingId: settingId,
      channelCode: NotificationChannel.EMAIL,
      kind,
      address,
      isDeleted: false,
      ...overrides,
    }) as EventChannelRecipient

  /** An EMAIL template the tenant is entitled to use, as templatesRepository.findById returns it. */
  const emailTemplate = { id: templateId, name: 'Survey invite', channelCode: 'EMAIL' }
  const smsTemplate = { id: templateId, name: 'Survey SMS', channelCode: 'SMS' }

  const parsedQuery: ParsedListQuery = { page: 1, limit: 15, skip: 0, filters: [], sorts: [] }

  /** findByName and listEvents both run through a query builder; both resolve through this one. */
  const mockQueryBuilder = {
    leftJoinAndSelect: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    addOrderBy: vi.fn(),
    skip: vi.fn(),
    take: vi.fn(),
    getOne: vi.fn(),
    getManyAndCount: vi.fn(),
  }

  /**
   * The derived filters build a correlated EXISTS subquery. Recording the conditions and
   * replaying them from getQuery is what lets the tests see which rows the filter matches.
   */
  const createSubQueryBuilder = () => {
    const conditions: string[] = []
    const builder = {
      select: vi.fn(() => builder),
      where: vi.fn((condition: string) => {
        conditions.push(condition)
        return builder
      }),
      andWhere: vi.fn((condition: string) => {
        conditions.push(condition)
        return builder
      }),
      getQuery: () => `SELECT 1 FROM event_channel_setting WHERE ${conditions.join(' AND ')}`,
    }
    return builder
  }

  /** Stands in for the transaction's EntityManager as well as the repository's own. */
  const mockManager = {
    transaction: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
  }

  const mockEventRepository = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
    manager: mockManager,
  }

  /** Unset by default, so getMaxRecipients falls back to its built-in 100. */
  const mockConfigurationRepository = {
    findOne: vi.fn(),
  }

  const mockChannelSettingRepository = {
    create: vi.fn(),
    save: vi.fn(),
  }

  const mockEmailLogoService = {
    findByIdIfApproved: vi.fn(),
  }

  const mockTemplatesRepository = {
    findById: vi.fn(),
  }

  /** Unset by default, so senderEmailDomain falls back to gov.bc.ca. */
  const mockConfigService = {
    get: vi.fn(),
  }

  /** Conditions the service added to the main list query. */
  const andWhereClauses = () => mockQueryBuilder.andWhere.mock.calls.map((call) => String(call[0]))

  const clauseContaining = (needle: string) =>
    andWhereClauses().find((clause) => clause.includes(needle))

  /** Recipient rows written inside the transaction, if any. */
  const savedRecipients = (): EventChannelRecipient[] => {
    const call = mockManager.save.mock.calls.find((args) => args[0] === EventChannelRecipient)
    return (call?.[1] ?? []) as EventChannelRecipient[]
  }

  /** The channel setting written inside the transaction. */
  const savedSetting = (): EventChannelSetting | undefined => {
    const call = mockManager.save.mock.calls.find((args) => args[0] === EventChannelSetting)
    return call?.[1] as EventChannelSetting | undefined
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        PhoneNumberService,
        { provide: getRepositoryToken(NotifyEvent), useValue: mockEventRepository },
        {
          provide: getRepositoryToken(EventChannelSetting),
          useValue: mockChannelSettingRepository,
        },
        { provide: EmailLogoService, useValue: mockEmailLogoService },
        {
          provide: getRepositoryToken(NotifyConfiguration),
          useValue: mockConfigurationRepository,
        },
        { provide: TemplatesRepository, useValue: mockTemplatesRepository },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    service = module.get<EventsService>(EventsService)

    // Reset rather than clear: the mocks are shared across the file, so a queued
    // mockResolvedValueOnce a failing expectation left unconsumed would surface in another test.
    vi.resetAllMocks()

    mockQueryBuilder.leftJoinAndSelect.mockReturnThis()
    mockQueryBuilder.where.mockReturnThis()
    mockQueryBuilder.andWhere.mockReturnThis()
    mockQueryBuilder.addOrderBy.mockReturnThis()
    mockQueryBuilder.skip.mockReturnThis()
    mockQueryBuilder.take.mockReturnThis()
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0])
    mockEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder)
    mockEventRepository.save.mockImplementation((event: NotifyEvent) => Promise.resolve(event))

    mockManager.createQueryBuilder.mockImplementation(() => createSubQueryBuilder())
    mockManager.transaction.mockImplementation(
      (callback: (manager: typeof mockManager) => Promise<unknown>) => callback(mockManager),
    )
    mockManager.find.mockResolvedValue([])
    mockManager.create.mockImplementation((_entity: unknown, data: object) => ({ ...data }))
    mockManager.save.mockImplementation((_entity: unknown, data: unknown) => Promise.resolve(data))
  })

  describe('createEvent', () => {
    it('creates an event that starts as a DRAFT with no channels', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null)
      mockEventRepository.create.mockReturnValueOnce(buildEvent())

      const result = await service.createEvent(
        tenantId,
        { name: '  Graduates Outcome Survey  ' },
        'user-guid',
      )

      expect(mockEventRepository.create).toHaveBeenCalledWith({
        tenantId,
        name: 'Graduates Outcome Survey',
        description: null,
        createdBy: 'user-guid',
        updatedBy: 'user-guid',
      })
      expect(result.status).toBe(EventStatus.DRAFT)
      expect(result.channelCodes).toEqual([])
      expect(result.emailSettings).toBeNull()
      expect(result.smsSettings).toBeNull()
    })

    it('rejects a name already taken by another live event', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(buildEvent())

      await expect(
        service.createEvent(tenantId, { name: 'Graduates Outcome Survey' }),
      ).rejects.toThrow(ConflictException)
      expect(mockEventRepository.save).not.toHaveBeenCalled()
    })

    it('maps a lost race on uq_notification_event_tenant_name to the same conflict', async () => {
      // Both callers pass the name check; the unique index is what rejects the second insert.
      mockQueryBuilder.getOne.mockResolvedValueOnce(null)
      mockEventRepository.create.mockReturnValueOnce({ tenantId, name: 'Survey' })
      mockEventRepository.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        }),
      )

      await expect(service.createEvent(tenantId, { name: 'Survey' })).rejects.toThrow(
        ConflictException,
      )
    })

    it('propagates a save failure that is not a unique violation', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null)
      mockEventRepository.create.mockReturnValueOnce({ tenantId, name: 'Survey' })
      mockEventRepository.save.mockRejectedValueOnce(new Error('connection terminated'))

      await expect(service.createEvent(tenantId, { name: 'Survey' })).rejects.toThrow(
        'connection terminated',
      )
    })
  })

  describe('updateEvent', () => {
    it('renames the event and replaces its description', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())
      mockQueryBuilder.getOne.mockResolvedValueOnce(null)

      const result = await service.updateEvent(
        tenantId,
        eventId,
        { name: '  Alumni Survey  ', description: 'Sent to alumni' },
        'user-guid',
      )

      expect(mockEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Alumni Survey',
          description: 'Sent to alumni',
          updatedBy: 'user-guid',
        }),
      )
      expect(result.name).toBe('Alumni Survey')
    })

    it('rejects a rename to a name another live event already holds', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())
      mockQueryBuilder.getOne.mockResolvedValueOnce(buildEvent())

      await expect(
        service.updateEvent(tenantId, eventId, { name: 'Alumni Survey' }),
      ).rejects.toThrow(ConflictException)
      expect(mockEventRepository.save).not.toHaveBeenCalled()
    })

    it('does not look for a conflict when the name is unchanged but for its case', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())

      await service.updateEvent(tenantId, eventId, { name: 'graduates outcome survey' })

      expect(mockQueryBuilder.getOne).not.toHaveBeenCalled()
      expect(mockEventRepository.save).toHaveBeenCalled()
    })

    it('maps a lost race on the rename to the same conflict', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())
      mockQueryBuilder.getOne.mockResolvedValueOnce(null)
      mockEventRepository.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        }),
      )

      await expect(
        service.updateEvent(tenantId, eventId, { name: 'Alumni Survey' }),
      ).rejects.toThrow(ConflictException)
    })

    it('throws when the event does not belong to the tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(
        service.updateEvent(tenantId, eventId, { name: 'Alumni Survey' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('listEvents', () => {
    it('returns the page of events with their derived status', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValueOnce([
        [buildEvent([{ channelCode: NotificationChannel.EMAIL, active: true, isDeleted: false }])],
        31,
      ])

      const result = await service.listEvents(tenantId, parsedQuery)

      expect(result.count).toBe(31)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(15)
      expect(result.totalPages).toBe(3)
      expect(result.data[0].status).toBe(EventStatus.ACTIVE)
      expect(result.data[0].channelCodes).toEqual([NotificationChannel.EMAIL])
    })

    it('matches the channel filter only against switched-on channel settings', async () => {
      // Otherwise filtering by a channel turns up events whose Channel badge does not show it.
      await service.listEvents(tenantId, parsedQuery, undefined, {
        channelCodes: [NotificationChannel.EMAIL],
      })

      const clause = clauseContaining('channelFilter')
      expect(clause).toContain('channelFilter.active = true')
      expect(clause).toContain('channelFilter.isDeleted = false')
      expect(clause).toContain('channelFilter.channelCode IN (:...filterChannelCodes)')
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(clause, {
        filterChannelCodes: [NotificationChannel.EMAIL],
      })
    })

    it('narrows to events with a switched-on channel when ACTIVE is the only status', async () => {
      await service.listEvents(tenantId, parsedQuery, undefined, {
        statuses: [EventStatus.ACTIVE],
      })

      const clause = clauseContaining('statusFilterActive')
      expect(clause).toMatch(/^EXISTS \(/)
      expect(clause).toContain('statusFilterActive.active = true')
    })

    it('narrows to events with no switched-on channel when DRAFT is the only status', async () => {
      await service.listEvents(tenantId, parsedQuery, undefined, {
        statuses: [EventStatus.DRAFT],
      })

      expect(clauseContaining('statusFilterActive')).toMatch(/^NOT EXISTS \(/)
    })

    it('applies no status clause when both statuses are selected', async () => {
      await service.listEvents(tenantId, parsedQuery, undefined, {
        statuses: [EventStatus.ACTIVE, EventStatus.DRAFT],
      })

      expect(clauseContaining('statusFilterActive')).toBeUndefined()
    })

    it('escapes LIKE wildcards in the search term so they match literally', async () => {
      await service.listEvents(tenantId, parsedQuery, '50%_off')

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('event.name ILIKE :search'),
        { search: '%50\\%\\_off%' },
      )
    })

    it('applies no search clause when no search term is given', async () => {
      await service.listEvents(tenantId, parsedQuery)

      expect(clauseContaining('ILIKE :search')).toBeUndefined()
    })
  })

  describe('recipient cap', () => {
    it('rejects an email save with more recipients than the configured cap', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())
      mockConfigurationRepository.findOne.mockResolvedValueOnce({ config: { value: 2 } })

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: false,
          senderEmail: null,
          templateId: null,
          to: ['alice@example.com', 'bob@example.com'],
          cc: ['carol@example.com'],
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('counts addresses after de-duplication, so one address twice is one recipient', async () => {
      const existing = { id: settingId, channelCode: NotificationChannel.EMAIL, recipients: [] }
      mockEventRepository.findOne.mockResolvedValue(buildEvent([existing]))
      mockConfigurationRepository.findOne.mockResolvedValueOnce({ config: { value: 1 } })

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: null,
        templateId: null,
        to: ['alice@example.com', 'ALICE@example.com'],
      })

      expect(savedRecipients()).toEqual([
        expect.objectContaining({ kind: EventRecipientKind.TO, address: 'alice@example.com' }),
      ])
    })

    it('falls back to the default cap when the configuration row cannot be read', async () => {
      const existing = { id: settingId, channelCode: NotificationChannel.EMAIL, recipients: [] }
      mockEventRepository.findOne.mockResolvedValue(buildEvent([existing]))
      mockConfigurationRepository.findOne.mockRejectedValueOnce(new Error('connection terminated'))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: null,
        templateId: null,
        to: ['alice@example.com'],
      })

      expect(savedRecipients()).toHaveLength(1)
    })

    it('applies the cap to the SMS channel as well', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())
      mockConfigurationRepository.findOne.mockResolvedValueOnce({ config: { value: 1 } })

      await expect(
        service.updateSmsChannelSetting(tenantId, eventId, {
          active: false,
          templateId: null,
          to: ['250 555 1234', '604 555 1234'],
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })
  })

  describe('updateEmailChannelSetting', () => {
    it('creates the EMAIL channel setting the first time the tab is saved', async () => {
      const created = { eventId, channelCode: NotificationChannel.EMAIL } as EventChannelSetting
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent()).mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: false,
            senderEmail: 'a@gov.bc.ca',
            templateId: null,
            recipients: [],
            useCustomHeader: false,
            headerLogoId: null,
            headerTitle: null,
          },
        ]),
      )
      mockChannelSettingRepository.create.mockReturnValue(created)

      const result = await service.updateEmailChannelSetting(
        tenantId,
        eventId,
        { active: false, senderEmail: 'a@gov.bc.ca', templateId: null },
        'user-guid',
      )

      expect(mockChannelSettingRepository.create).toHaveBeenCalledWith({
        eventId,
        channelCode: NotificationChannel.EMAIL,
        createdBy: 'user-guid',
      })
      expect(savedSetting()).toEqual(
        expect.objectContaining({
          senderEmail: 'a@gov.bc.ca',
          active: false,
          updatedBy: 'user-guid',
        }),
      )
      expect(result.emailSettings).toEqual({
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        to: [],
        cc: [],
        bcc: [],
        useCustomHeader: false,
        headerLogoId: null,
        headerTitle: null,
      })
      expect(result.status).toBe(EventStatus.DRAFT)
    })

    it('updates the existing EMAIL channel setting rather than creating a second one', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
        active: false,
        senderEmail: 'old@gov.bc.ca',
        templateId: null,
        recipients: [],
        isDeleted: false,
      } as unknown as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([existing]))

      await service.updateEmailChannelSetting(
        tenantId,
        eventId,
        { active: false, senderEmail: 'new@gov.bc.ca', templateId: null },
        'user-guid',
      )

      expect(mockChannelSettingRepository.create).not.toHaveBeenCalled()
      expect(savedSetting()).toEqual(
        expect.objectContaining({ id: settingId, senderEmail: 'new@gov.bc.ca' }),
      )
    })

    it('saves the channel setting and its recipients in one transaction', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
        recipients: [],
      } as unknown as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([existing]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        to: ['alice@example.com'],
      })

      expect(mockManager.transaction).toHaveBeenCalledTimes(1)
      expect(mockChannelSettingRepository.save).not.toHaveBeenCalled()
    })

    it('stores a blank sender email as null while the channel stays off', async () => {
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent())
        .mockResolvedValueOnce(buildEvent())
      mockChannelSettingRepository.create.mockReturnValue({} as EventChannelSetting)

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: '   ',
        templateId: null,
      })

      expect(savedSetting()).toEqual(expect.objectContaining({ senderEmail: null }))
    })

    it('rejects activating the channel with no template', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: false,
            senderEmail: 'a@gov.bc.ca',
            templateId: null,
            isDeleted: false,
          },
        ]),
      )

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: true,
          senderEmail: 'a@gov.bc.ca',
          templateId: null,
          to: ['recipient@gov.bc.ca'],
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('rejects activating the channel with no sender email', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: false,
            senderEmail: null,
            templateId,
            isDeleted: false,
          },
        ]),
      )
      mockTemplatesRepository.findById.mockResolvedValueOnce(emailTemplate)

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: true,
          senderEmail: null,
          templateId,
          to: ['recipient@gov.bc.ca'],
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('rejects activating the channel with no "to" recipients', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: false,
            senderEmail: 'a@gov.bc.ca',
            templateId,
            isDeleted: false,
          },
        ]),
      )
      mockTemplatesRepository.findById.mockResolvedValueOnce(emailTemplate)

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: true,
          senderEmail: 'a@gov.bc.ca',
          templateId,
          cc: ['copied@gov.bc.ca'],
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('rejects activating the channel even when the stored settings were complete', async () => {
      // The incoming settings replace the stored ones, so completeness is judged on what is
      // being written, not on what the row happens to hold.
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: false,
            senderEmail: 'a@gov.bc.ca',
            templateId,
            recipients: [buildRecipient(EventRecipientKind.TO, 'recipient@gov.bc.ca')],
            isDeleted: false,
          },
        ]),
      )

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: true,
          senderEmail: 'a@gov.bc.ca',
          templateId: null,
          to: ['recipient@gov.bc.ca'],
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('allows incomplete settings while the channel is being left off', async () => {
      mockEventRepository.findOne
        .mockResolvedValueOnce(
          buildEvent([
            {
              channelCode: NotificationChannel.EMAIL,
              active: false,
              senderEmail: null,
              templateId: null,
              isDeleted: false,
            },
          ]),
        )
        .mockResolvedValueOnce(buildEvent())

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
      })

      expect(savedSetting()).toEqual(
        expect.objectContaining({ senderEmail: 'a@gov.bc.ca', active: false }),
      )
    })

    it('switches the channel on when the submitted settings are complete', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        recipients: [],
        isDeleted: false,
      } as unknown as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(
          buildEvent([
            {
              ...existing,
              active: true,
              templateId,
              recipients: [buildRecipient(EventRecipientKind.TO, 'recipient@gov.bc.ca')],
            },
          ]),
        )
      mockTemplatesRepository.findById.mockResolvedValueOnce(emailTemplate)

      const result = await service.updateEmailChannelSetting(tenantId, eventId, {
        active: true,
        senderEmail: 'a@gov.bc.ca',
        templateId,
        to: ['recipient@gov.bc.ca'],
      })

      expect(savedSetting()).toEqual(expect.objectContaining({ active: true, templateId }))
      expect(savedRecipients()).toEqual([
        expect.objectContaining({
          kind: EventRecipientKind.TO,
          address: 'recipient@gov.bc.ca',
          channelCode: NotificationChannel.EMAIL,
        }),
      ])
      expect(result.status).toBe(EventStatus.ACTIVE)
      expect(result.channelCodes).toEqual([NotificationChannel.EMAIL])
    })

    it('switches an active channel back off when the tab submits active = false', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
        active: true,
        senderEmail: 'a@gov.bc.ca',
        templateId,
        recipients: [buildRecipient(EventRecipientKind.TO, 'recipient@gov.bc.ca')],
        isDeleted: false,
      } as unknown as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, active: false }]))
      mockTemplatesRepository.findById.mockResolvedValueOnce(emailTemplate)
      mockManager.find.mockResolvedValueOnce([
        buildRecipient(EventRecipientKind.TO, 'recipient@gov.bc.ca'),
      ])

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId,
        to: ['recipient@gov.bc.ca'],
      })

      expect(savedSetting()).toEqual(expect.objectContaining({ active: false }))
    })

    it('revives a soft-deleted EMAIL row instead of inserting a duplicate', async () => {
      // uq_event_channel_setting is not partial, so a second row would violate it.
      const deleted = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
        active: false,
        senderEmail: null,
        recipients: [],
        isDeleted: true,
      } as unknown as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([deleted]))
        .mockResolvedValueOnce(buildEvent([deleted]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
      })

      expect(mockChannelSettingRepository.create).not.toHaveBeenCalled()
      expect(savedSetting()).toEqual(expect.objectContaining({ id: settingId, isDeleted: false }))
    })

    it('throws when the event does not belong to the tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: false,
          senderEmail: null,
          templateId: null,
        }),
      ).rejects.toThrow(NotFoundException)
    })

    it('stores a custom header', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([existing]))
      mockEmailLogoService.findByIdIfApproved.mockResolvedValueOnce({ id: logoId })

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        useCustomHeader: true,
        headerLogoId: logoId,
        headerTitle: '  Ministry of Education  ',
      })

      expect(savedSetting()).toEqual(
        expect.objectContaining({
          useCustomHeader: true,
          headerLogoId: logoId,
          headerTitle: 'Ministry of Education',
        }),
      )
    })

    it('stores a custom header with no logo and no title', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([existing]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        useCustomHeader: true,
        headerLogoId: null,
        headerTitle: '   ',
      })

      expect(mockEmailLogoService.findByIdIfApproved).not.toHaveBeenCalled()
      expect(savedSetting()).toEqual(
        expect.objectContaining({
          useCustomHeader: true,
          headerLogoId: null,
          headerTitle: null,
        }),
      )
    })

    it('clears the header values when the tenant default is selected', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
        useCustomHeader: true,
        headerLogoId: logoId,
        headerTitle: 'Ministry of Education',
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([existing]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        useCustomHeader: false,
        headerLogoId: logoId,
        headerTitle: 'Ministry of Education',
      })

      expect(savedSetting()).toEqual(
        expect.objectContaining({
          useCustomHeader: false,
          headerLogoId: null,
          headerTitle: null,
        }),
      )
    })

    it('rejects a header logo that is not approved', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())
      mockEmailLogoService.findByIdIfApproved.mockResolvedValueOnce(null)

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: false,
          senderEmail: 'a@gov.bc.ca',
          templateId: null,
          useCustomHeader: true,
          headerLogoId: logoId,
        }),
      ).rejects.toThrow(BadRequestException)

      expect(mockManager.transaction).not.toHaveBeenCalled()
    })
  })

  describe('sender email domain', () => {
    it('rejects a sender address outside the permitted sending domain', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: false,
          senderEmail: 'no-reply@example.com',
          templateId: null,
        }),
      ).rejects.toThrow(/must be an @gov.bc.ca address/)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('accepts a sender address in the permitted domain regardless of case', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([existing]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'No-Reply@GOV.BC.CA',
        templateId: null,
      })

      expect(savedSetting()).toEqual(expect.objectContaining({ senderEmail: 'No-Reply@GOV.BC.CA' }))
    })

    it('honours the configured sending domain over the built-in default', async () => {
      mockConfigService.get.mockReturnValue('example.gov')
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: false,
          senderEmail: 'no-reply@gov.bc.ca',
          templateId: null,
        }),
      ).rejects.toThrow(/must be an @example.gov address/)
    })
  })

  describe('template validation', () => {
    it('rejects a template that is not an active template of this tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())
      mockTemplatesRepository.findById.mockResolvedValueOnce(null)

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: false,
          senderEmail: 'a@gov.bc.ca',
          templateId,
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockTemplatesRepository.findById).toHaveBeenCalledWith(tenantId, templateId)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('rejects an SMS template selected for the email channel', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())
      mockTemplatesRepository.findById.mockResolvedValueOnce(smsTemplate)

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          active: false,
          senderEmail: 'a@gov.bc.ca',
          templateId,
        }),
      ).rejects.toThrow(/cannot be used for the EMAIL channel/)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('rejects an email template selected for the SMS channel', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())
      mockTemplatesRepository.findById.mockResolvedValueOnce(emailTemplate)

      await expect(
        service.updateSmsChannelSetting(tenantId, eventId, {
          active: false,
          templateId,
        }),
      ).rejects.toThrow(/cannot be used for the SMS channel/)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('skips the template check when no template is selected', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([existing]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
      })

      expect(mockTemplatesRepository.findById).not.toHaveBeenCalled()
    })
  })

  describe('recipient sync', () => {
    const emailSetting = () =>
      ({
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        recipients: [],
        isDeleted: false,
      }) as unknown as EventChannelSetting

    const saveRecipients = (to?: string[], cc?: string[], bcc?: string[]) =>
      service.updateEmailChannelSetting(
        tenantId,
        eventId,
        { active: false, senderEmail: 'a@gov.bc.ca', templateId: null, to, cc, bcc },
        'user-guid',
      )

    beforeEach(() => {
      mockEventRepository.findOne.mockResolvedValue(buildEvent([emailSetting()]))
    })

    it('inserts a row for each newly entered address, tagged with its list', async () => {
      mockManager.find.mockResolvedValueOnce([])

      await saveRecipients(['alice@example.com'], ['bob@example.com'], ['carol@example.com'])

      expect(savedRecipients()).toEqual([
        expect.objectContaining({
          channelSettingId: settingId,
          channelCode: NotificationChannel.EMAIL,
          kind: EventRecipientKind.TO,
          address: 'alice@example.com',
          createdBy: 'user-guid',
        }),
        expect.objectContaining({ kind: EventRecipientKind.CC, address: 'bob@example.com' }),
        expect.objectContaining({ kind: EventRecipientKind.BCC, address: 'carol@example.com' }),
      ])
    })

    it('soft deletes an address the tab no longer lists rather than removing the row', async () => {
      mockManager.find.mockResolvedValueOnce([
        buildRecipient(EventRecipientKind.TO, 'alice@example.com'),
        buildRecipient(EventRecipientKind.TO, 'bob@example.com'),
      ])

      await saveRecipients(['alice@example.com'])

      expect(savedRecipients()).toEqual([
        expect.objectContaining({
          address: 'bob@example.com',
          isDeleted: true,
          updatedBy: 'user-guid',
        }),
      ])
    })

    it('revives a removed address that comes back instead of inserting a second row', async () => {
      // uq_event_channel_recipient_active only covers live rows, so two rows for one address
      // would collide the moment both were live.
      mockManager.find.mockResolvedValueOnce([
        buildRecipient(EventRecipientKind.TO, 'alice@example.com', { isDeleted: true }),
      ])

      await saveRecipients(['alice@example.com'])

      expect(mockManager.create).not.toHaveBeenCalled()
      expect(savedRecipients()).toEqual([
        expect.objectContaining({
          id: 'recipient-TO-alice@example.com',
          isDeleted: false,
          updatedBy: 'user-guid',
        }),
      ])
    })

    it('treats the same address in a different list as its own row', async () => {
      mockManager.find.mockResolvedValueOnce([
        buildRecipient(EventRecipientKind.TO, 'alice@example.com'),
      ])

      await saveRecipients(['alice@example.com'], ['alice@example.com'])

      expect(savedRecipients()).toEqual([
        expect.objectContaining({
          kind: EventRecipientKind.CC,
          address: 'alice@example.com',
        }),
      ])
    })

    it('writes nothing when the submitted recipients match what is stored', async () => {
      mockManager.find.mockResolvedValueOnce([
        buildRecipient(EventRecipientKind.TO, 'alice@example.com'),
      ])

      await saveRecipients(['alice@example.com'])

      expect(savedRecipients()).toEqual([])
    })

    it('groups the stored recipients back into to, cc and bcc, ignoring removed ones', async () => {
      const setting = {
        ...emailSetting(),
        recipients: [
          buildRecipient(EventRecipientKind.TO, 'alice@example.com'),
          buildRecipient(EventRecipientKind.CC, 'bob@example.com'),
          buildRecipient(EventRecipientKind.BCC, 'carol@example.com'),
          buildRecipient(EventRecipientKind.TO, 'dave@example.com', { isDeleted: true }),
        ],
      } as unknown as EventChannelSetting
      mockEventRepository.findOne.mockResolvedValue(buildEvent([setting]))

      const result = await service.getEvent(tenantId, eventId)

      expect(result.emailSettings).toEqual(
        expect.objectContaining({
          to: ['alice@example.com'],
          cc: ['bob@example.com'],
          bcc: ['carol@example.com'],
        }),
      )
    })
  })

  describe('updateSmsChannelSetting', () => {
    const smsSetting = (overrides: Partial<EventChannelSetting> = {}) =>
      ({
        id: settingId,
        channelCode: NotificationChannel.SMS,
        active: false,
        templateId: null,
        fromPhoneNumberId: null,
        recipients: [],
        isDeleted: false,
        ...overrides,
      }) as unknown as EventChannelSetting

    it('creates the SMS channel setting the first time the tab is saved', async () => {
      const created = { eventId, channelCode: NotificationChannel.SMS } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent())
        .mockResolvedValueOnce(buildEvent([smsSetting()]))
      mockChannelSettingRepository.create.mockReturnValue(created)

      const result = await service.updateSmsChannelSetting(
        tenantId,
        eventId,
        { active: false, templateId: null },
        'user-guid',
      )

      expect(mockChannelSettingRepository.create).toHaveBeenCalledWith({
        eventId,
        channelCode: NotificationChannel.SMS,
        createdBy: 'user-guid',
      })
      expect(savedSetting()).toEqual(
        expect.objectContaining({ active: false, isDeleted: false, updatedBy: 'user-guid' }),
      )
      expect(result.smsSettings).toEqual({ active: false, templateId: null, to: [] })
    })

    it('stores recipients as E.164 numbers in the TO list, de-duplicated', async () => {
      mockEventRepository.findOne.mockResolvedValue(buildEvent([smsSetting()]))

      await service.updateSmsChannelSetting(tenantId, eventId, {
        active: false,
        templateId: null,
        to: ['250 555 1234', '(250) 555-1234', '+16045551234'],
      })

      expect(savedRecipients()).toEqual([
        expect.objectContaining({
          kind: EventRecipientKind.TO,
          address: '+12505551234',
          channelCode: NotificationChannel.SMS,
        }),
        expect.objectContaining({ kind: EventRecipientKind.TO, address: '+16045551234' }),
      ])
    })

    it('rejects activating the channel while no sender number is claimed', async () => {
      // fromPhoneNumberId is not settable yet, so an SMS channel cannot be switched on at all.
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent([smsSetting()]))
      mockTemplatesRepository.findById.mockResolvedValueOnce(smsTemplate)

      await expect(
        service.updateSmsChannelSetting(tenantId, eventId, {
          active: true,
          templateId,
          to: ['250 555 1234'],
        }),
      ).rejects.toThrow(/sender phone number/)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('rejects activating the channel with no template', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([smsSetting({ fromPhoneNumberId: 'number-uuid-1' })]),
      )

      await expect(
        service.updateSmsChannelSetting(tenantId, eventId, {
          active: true,
          templateId: null,
          to: ['250 555 1234'],
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('rejects activating the channel with no recipients', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([smsSetting({ fromPhoneNumberId: 'number-uuid-1' })]),
      )
      mockTemplatesRepository.findById.mockResolvedValueOnce(smsTemplate)

      await expect(
        service.updateSmsChannelSetting(tenantId, eventId, { active: true, templateId }),
      ).rejects.toThrow(BadRequestException)
      expect(mockManager.transaction).not.toHaveBeenCalled()
    })

    it('switches the channel on when the submitted settings are complete', async () => {
      const claimed = smsSetting({ fromPhoneNumberId: 'number-uuid-1' })
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([claimed]))
        .mockResolvedValueOnce(
          buildEvent([
            {
              ...claimed,
              active: true,
              templateId,
              recipients: [
                buildRecipient(EventRecipientKind.TO, '+12505551234', {
                  channelCode: NotificationChannel.SMS,
                }),
              ],
            },
          ]),
        )
      mockTemplatesRepository.findById.mockResolvedValueOnce(smsTemplate)

      const result = await service.updateSmsChannelSetting(tenantId, eventId, {
        active: true,
        templateId,
        to: ['250 555 1234'],
      })

      expect(savedSetting()).toEqual(expect.objectContaining({ active: true, templateId }))
      expect(result.channelCodes).toEqual([NotificationChannel.SMS])
      expect(result.smsSettings).toEqual({ active: true, templateId, to: ['+12505551234'] })
      expect(result.status).toBe(EventStatus.ACTIVE)
    })

    it('revives a soft-deleted SMS row instead of inserting a duplicate', async () => {
      const deleted = smsSetting({ isDeleted: true })
      mockEventRepository.findOne.mockResolvedValue(buildEvent([deleted]))

      await service.updateSmsChannelSetting(tenantId, eventId, { active: false, templateId: null })

      expect(mockChannelSettingRepository.create).not.toHaveBeenCalled()
      expect(savedSetting()).toEqual(expect.objectContaining({ id: settingId, isDeleted: false }))
    })

    it('throws when the event does not belong to the tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(
        service.updateSmsChannelSetting(tenantId, eventId, { active: false, templateId: null }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('deactivateEmailChannel', () => {
    it('switches the channel off, leaving its settings in place', async () => {
      const existing = {
        id: settingId,
        channelCode: NotificationChannel.EMAIL,
        active: true,
        senderEmail: 'a@gov.bc.ca',
        templateId,
        recipients: [buildRecipient(EventRecipientKind.TO, 'recipient@gov.bc.ca')],
        isDeleted: false,
      } as unknown as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, active: false }]))

      const result = await service.deactivateEmailChannel(tenantId, eventId, 'user-guid')

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          active: false,
          senderEmail: 'a@gov.bc.ca',
          templateId,
          updatedBy: 'user-guid',
        }),
      )
      expect(result.status).toBe(EventStatus.DRAFT)
      expect(result.emailSettings?.to).toEqual(['recipient@gov.bc.ca'])
    })

    it('leaves an unconfigured channel alone rather than writing an empty inactive row', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())

      const result = await service.deactivateEmailChannel(tenantId, eventId)

      expect(mockChannelSettingRepository.create).not.toHaveBeenCalled()
      expect(mockChannelSettingRepository.save).not.toHaveBeenCalled()
      expect(result.emailSettings).toBeNull()
    })

    it('ignores a soft-deleted row rather than reviving it', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            id: settingId,
            channelCode: NotificationChannel.EMAIL,
            active: false,
            senderEmail: 'a@gov.bc.ca',
            isDeleted: true,
          },
        ]),
      )

      await service.deactivateEmailChannel(tenantId, eventId)

      expect(mockChannelSettingRepository.save).not.toHaveBeenCalled()
    })

    it('throws when the event does not belong to the tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(service.deactivateEmailChannel(tenantId, eventId)).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('deactivateSmsChannel', () => {
    it('switches the SMS channel off, leaving the email channel alone', async () => {
      const emailSetting = {
        id: 'setting-uuid-2',
        channelCode: NotificationChannel.EMAIL,
        active: true,
        senderEmail: 'a@gov.bc.ca',
        templateId,
        recipients: [],
        isDeleted: false,
      } as unknown as EventChannelSetting
      const smsSetting = {
        id: settingId,
        channelCode: NotificationChannel.SMS,
        active: true,
        templateId,
        recipients: [],
        isDeleted: false,
      } as unknown as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([emailSetting, smsSetting]))
        .mockResolvedValueOnce(buildEvent([emailSetting, { ...smsSetting, active: false }]))

      const result = await service.deactivateSmsChannel(tenantId, eventId, 'user-guid')

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: settingId,
          active: false,
          templateId,
          updatedBy: 'user-guid',
        }),
      )
      expect(result.channelCodes).toEqual([NotificationChannel.EMAIL])
      expect(result.status).toBe(EventStatus.ACTIVE)
    })

    it('leaves an unconfigured SMS channel alone rather than writing an empty inactive row', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())

      const result = await service.deactivateSmsChannel(tenantId, eventId)

      expect(mockChannelSettingRepository.create).not.toHaveBeenCalled()
      expect(mockChannelSettingRepository.save).not.toHaveBeenCalled()
      expect(result.smsSettings).toBeNull()
    })

    it('throws when the event does not belong to the tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(service.deactivateSmsChannel(tenantId, eventId)).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('getEvent', () => {
    it('returns null email settings until the email tab has been saved', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent())

      const result = await service.getEvent(tenantId, eventId)

      expect(result.emailSettings).toBeNull()
    })

    it('ignores a soft-deleted EMAIL channel setting', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: false,
            senderEmail: 'a@gov.bc.ca',
            isDeleted: true,
          },
        ]),
      )

      const result = await service.getEvent(tenantId, eventId)

      expect(result.emailSettings).toBeNull()
    })

    it('excludes a configured but inactive channel from channelCodes', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: false,
            senderEmail: 'a@gov.bc.ca',
            isDeleted: false,
          },
        ]),
      )

      const result = await service.getEvent(tenantId, eventId)

      expect(result.channelCodes).toEqual([])
      expect(result.status).toBe(EventStatus.DRAFT)
    })

    it('derives ACTIVE from any switched-on channel, ignoring the ones left off', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: true,
            senderEmail: 'a@gov.bc.ca',
            isDeleted: false,
          },
          {
            channelCode: NotificationChannel.SMS,
            active: false,
            isDeleted: false,
          },
        ]),
      )

      const result = await service.getEvent(tenantId, eventId)

      expect(result.channelCodes).toEqual([NotificationChannel.EMAIL])
      expect(result.status).toBe(EventStatus.ACTIVE)
    })

    it('lists every switched-on channel in channelCodes', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: true,
            senderEmail: 'a@gov.bc.ca',
            isDeleted: false,
          },
          {
            channelCode: NotificationChannel.SMS,
            active: true,
            isDeleted: false,
          },
        ]),
      )

      const result = await service.getEvent(tenantId, eventId)

      expect(result.channelCodes).toEqual([NotificationChannel.EMAIL, NotificationChannel.SMS])
      expect(result.status).toBe(EventStatus.ACTIVE)
    })

    it('throws when the event belongs to another tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(service.getEvent(tenantId, eventId)).rejects.toThrow(NotFoundException)
    })
  })
})
