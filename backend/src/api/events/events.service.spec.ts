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
            {
              channelCode: NotificationChannel.EMAIL,
              active: false,
              senderEmail: 'a@gov.bc.ca',
              templateId: null,
            },
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
      expect(result.emailSettings).toEqual({
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        to: [],
        cc: [],
        bcc: [],
      })
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

    it('rejects activating the channel with no "to" recipients', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            senderEmail: 'a@gov.bc.ca',
            templateId: 'template-uuid-1',
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

    it('activates the channel once it has a sender email and a template', async () => {
      const existing = {
        channelCode: NotificationChannel.EMAIL,
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(
          buildEvent([{ ...existing, active: true, templateId: 'template-uuid-1' }]),
        )

      const result = await service.updateEmailChannelSetting(tenantId, eventId, {
        active: true,
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
        to: ['recipient@gov.bc.ca'],
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          active: true,
          templateId: 'template-uuid-1',
          to: 'recipient@gov.bc.ca',
        }),
      )
      expect(result.status).toBe(EventStatus.ACTIVE)
      expect(result.channelCodes).toEqual([NotificationChannel.EMAIL])
    })

    it('clears isDraft when activating a channel that was saved as a draft', async () => {
      const existing = {
        channelCode: NotificationChannel.EMAIL,
        active: false,
        isDraft: true,
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, active: true, isDraft: false }]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: true,
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
        to: ['recipient@gov.bc.ca'],
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: true, isDraft: false }),
      )
    })

    it('leaves isDraft untouched when merely deactivating a channel', async () => {
      const existing = {
        channelCode: NotificationChannel.EMAIL,
        active: true,
        isDraft: true,
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, active: false }]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: false, isDraft: true }),
      )
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

  describe('updateEmailChannelDraft', () => {
    it('honors active on an existing channel even when the draft data is incomplete', async () => {
      const existing = {
        id: 'setting-uuid-1',
        channelCode: NotificationChannel.EMAIL,
        active: false,
        isDraft: false,
        senderEmail: null,
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, active: true, isDraft: true }]))

      await service.updateEmailChannelDraft(tenantId, eventId, {
        active: true,
        to: ['recipient@gov.bc.ca'],
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: true, isDraft: true, senderEmail: null }),
      )
    })

    it('activates a brand-new channel when the draft is toggled on, even with no other data', async () => {
      const created = { channelCode: NotificationChannel.EMAIL } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent())
        .mockResolvedValueOnce(buildEvent([{ ...created, active: true, isDraft: true }]))
      mockChannelSettingRepository.create.mockReturnValue(created)

      await service.updateEmailChannelDraft(tenantId, eventId, { active: true })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: true, isDraft: true }),
      )
    })

    it('deactivates immediately when the draft is toggled off', async () => {
      const existing = {
        id: 'setting-uuid-1',
        channelCode: NotificationChannel.EMAIL,
        active: true,
        isDraft: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, active: false, isDraft: true }]))

      await service.updateEmailChannelDraft(tenantId, eventId, {
        active: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: false, isDraft: true }),
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

    it('returns DRAFT for an active channel that still has unapplied draft edits', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: true,
            isDraft: true,
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
