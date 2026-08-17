import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { vi } from 'vitest'
import { EventsService } from './events.service'
import { NotifyEvent } from './entities/event.entity'
import { EventChannelSetting } from './entities/event-channel-setting.entity'
import { EventStatus } from '../../enum/event-status.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'

describe('EventsService', () => {
  let service: EventsService

  const tenantId = 'tenant-uuid-1'
  const eventId = 'event-uuid-1'

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

  const mockEventRepository = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  }

  const mockChannelSettingRepository = {
    create: vi.fn(),
    save: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(NotifyEvent), useValue: mockEventRepository },
        {
          provide: getRepositoryToken(EventChannelSetting),
          useValue: mockChannelSettingRepository,
        },
      ],
    }).compile()

    service = module.get<EventsService>(EventsService)
    vi.clearAllMocks()
  })

  describe('updateEmailChannelSetting', () => {
    it('creates the EMAIL channel setting the first time the tab is saved', async () => {
      const created = { eventId, channelCode: NotificationChannel.EMAIL } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent())
        .mockResolvedValueOnce(
          buildEvent([
            { channelCode: NotificationChannel.EMAIL, active: false, senderEmail: 'a@gov.bc.ca' },
          ]),
        )
      mockChannelSettingRepository.create.mockReturnValue(created)

      const result = await service.updateEmailChannelSetting(
        tenantId,
        eventId,
        { active: false, senderEmail: 'a@gov.bc.ca' },
        'user-guid',
      )

      expect(mockChannelSettingRepository.create).toHaveBeenCalledWith({
        eventId,
        channelCode: NotificationChannel.EMAIL,
        createdBy: 'user-guid',
      })
      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          active: false,
          senderEmail: 'a@gov.bc.ca',
          updatedBy: 'user-guid',
        }),
      )
      expect(result.emailSettings).toEqual({ active: false, senderEmail: 'a@gov.bc.ca' })
      expect(result.status).toBe(EventStatus.DRAFT)
    })

    it('updates the existing EMAIL channel setting rather than creating a second one', async () => {
      const existing = {
        id: 'setting-uuid-1',
        channelCode: NotificationChannel.EMAIL,
        active: false,
        senderEmail: 'old@gov.bc.ca',
        templateId: null,
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([existing]))

      await service.updateEmailChannelSetting(
        tenantId,
        eventId,
        { active: false, senderEmail: 'new@gov.bc.ca' },
        'user-guid',
      )

      expect(mockChannelSettingRepository.create).not.toHaveBeenCalled()
      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'setting-uuid-1', senderEmail: 'new@gov.bc.ca' }),
      )
    })

    it('stores a blank sender email as null so a draft can be saved', async () => {
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent())
        .mockResolvedValueOnce(buildEvent())
      mockChannelSettingRepository.create.mockReturnValue({} as EventChannelSetting)

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: null,
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ senderEmail: null }),
      )
    })

    it('rejects activating the channel while it has no template', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
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
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockChannelSettingRepository.save).not.toHaveBeenCalled()
    })

    it('rejects activating the channel with no sender email', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            senderEmail: null,
            templateId: 'template-uuid-1',
            isDeleted: false,
          },
        ]),
      )

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, { active: true, senderEmail: null }),
      ).rejects.toThrow(BadRequestException)
      expect(mockChannelSettingRepository.save).not.toHaveBeenCalled()
    })

    it('activates the channel once it has a sender email and a template', async () => {
      const existing = {
        channelCode: NotificationChannel.EMAIL,
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, active: true }]))

      const result = await service.updateEmailChannelSetting(tenantId, eventId, {
        active: true,
        senderEmail: 'a@gov.bc.ca',
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: true }),
      )
      expect(result.status).toBe(EventStatus.ACTIVE)
      expect(result.channelCodes).toEqual([NotificationChannel.EMAIL])
    })

    it('revives a soft-deleted EMAIL row instead of inserting a duplicate', async () => {
      // uq_event_channel_setting is not partial, so a second row would violate it.
      const deleted = {
        id: 'setting-uuid-1',
        channelCode: NotificationChannel.EMAIL,
        active: false,
        senderEmail: null,
        isDeleted: true,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([deleted]))
        .mockResolvedValueOnce(buildEvent([deleted]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
      })

      expect(mockChannelSettingRepository.create).not.toHaveBeenCalled()
      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'setting-uuid-1', isDeleted: false }),
      )
    })

    it('throws when the event does not belong to the tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, { active: false, senderEmail: null }),
      ).rejects.toThrow(NotFoundException)
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
  })
})
