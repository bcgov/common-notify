import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { vi } from 'vitest'
import { EventsService } from './events.service'
import { NotifyEvent } from './entities/event.entity'
import { EventChannelSetting } from './entities/event-channel-setting.entity'
import { EventStatus } from '../../enum/event-status.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { PhoneNumberService } from '../notify/services/phone-number.service'

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
        PhoneNumberService,
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
      mockEventRepository.findOne.mockResolvedValueOnce(buildEvent()).mockResolvedValueOnce(
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
        { senderEmail: 'a@gov.bc.ca', templateId: null },
        'user-guid',
      )

      expect(mockChannelSettingRepository.create).toHaveBeenCalledWith({
        eventId,
        channelCode: NotificationChannel.EMAIL,
        createdBy: 'user-guid',
      })
      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          senderEmail: 'a@gov.bc.ca',
          isDraft: false,
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
        { senderEmail: 'new@gov.bc.ca', templateId: null },
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
        senderEmail: null,
        templateId: null,
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ senderEmail: null }),
      )
    })

    it('rejects incomplete settings while the channel is currently active, with no template', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: true,
            senderEmail: 'a@gov.bc.ca',
            templateId: null,
            isDeleted: false,
          },
        ]),
      )

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          senderEmail: 'a@gov.bc.ca',
          templateId: null,
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockChannelSettingRepository.save).not.toHaveBeenCalled()
    })

    it('rejects incomplete settings while the channel is currently active, with no sender email', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: true,
            senderEmail: null,
            templateId: 'template-uuid-1',
            isDeleted: false,
          },
        ]),
      )

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          senderEmail: null,
          templateId: 'template-uuid-1',
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockChannelSettingRepository.save).not.toHaveBeenCalled()
    })

    it('rejects incomplete settings while the channel is currently active, with no "to" recipients', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: true,
            senderEmail: 'a@gov.bc.ca',
            templateId: 'template-uuid-1',
            isDeleted: false,
          },
        ]),
      )

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          senderEmail: 'a@gov.bc.ca',
          templateId: 'template-uuid-1',
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockChannelSettingRepository.save).not.toHaveBeenCalled()
    })

    it('allows incomplete settings while the channel is currently inactive', async () => {
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
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ senderEmail: 'a@gov.bc.ca' }),
      )
    })

    it('saves complete settings while the channel is currently active', async () => {
      const existing = {
        channelCode: NotificationChannel.EMAIL,
        active: true,
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, templateId: 'template-uuid-1' }]))

      const result = await service.updateEmailChannelSetting(tenantId, eventId, {
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
        to: ['recipient@gov.bc.ca'],
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'template-uuid-1',
          to: 'recipient@gov.bc.ca',
        }),
      )
      expect(result.status).toBe(EventStatus.ACTIVE)
      expect(result.channelCodes).toEqual([NotificationChannel.EMAIL])
    })

    it('always clears isDraft, since applying settings finalizes them', async () => {
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
        .mockResolvedValueOnce(buildEvent([{ ...existing, isDraft: false }]))

      await service.updateEmailChannelSetting(tenantId, eventId, {
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
        to: ['recipient@gov.bc.ca'],
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isDraft: false }),
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
        senderEmail: 'a@gov.bc.ca',
        templateId: null,
      })

      expect(mockChannelSettingRepository.create).not.toHaveBeenCalled()
      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'setting-uuid-1', isDeleted: false }),
      )
    })

    it('throws when the event does not belong to the tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(
        service.updateEmailChannelSetting(tenantId, eventId, {
          senderEmail: null,
          templateId: null,
        }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('updateEmailChannelDraft', () => {
    it('creates the EMAIL channel setting as a draft the first time the tab is saved', async () => {
      const created = { eventId, channelCode: NotificationChannel.EMAIL } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent())
        .mockResolvedValueOnce(
          buildEvent([{ ...created, isDraft: true, senderEmail: 'a@gov.bc.ca' }]),
        )
      mockChannelSettingRepository.create.mockReturnValue(created)

      await service.updateEmailChannelDraft(tenantId, eventId, { senderEmail: 'a@gov.bc.ca' })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isDraft: true, senderEmail: 'a@gov.bc.ca' }),
      )
    })

    it('saves incomplete draft data without requiring completeness', async () => {
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
        .mockResolvedValueOnce(buildEvent([{ ...existing, isDraft: true }]))

      await service.updateEmailChannelDraft(tenantId, eventId, {
        to: ['recipient@gov.bc.ca'],
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isDraft: true, to: 'recipient@gov.bc.ca', senderEmail: null }),
      )
    })

    it('leaves active untouched, since the toggle owns it independently', async () => {
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
        .mockResolvedValueOnce(
          buildEvent([{ ...existing, isDraft: true, templateId: 'template-uuid-2' }]),
        )

      await service.updateEmailChannelDraft(tenantId, eventId, {
        templateId: 'template-uuid-2',
      })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: true, isDraft: true, templateId: 'template-uuid-2' }),
      )
    })

    it('throws when the event does not belong to the tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(
        service.updateEmailChannelDraft(tenantId, eventId, { senderEmail: null }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('updateEmailChannelActive', () => {
    it('creates the EMAIL channel setting and marks it a draft when turned on before it is complete', async () => {
      const created = { eventId, channelCode: NotificationChannel.EMAIL } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent())
        .mockResolvedValueOnce(buildEvent([{ ...created, active: true, isDraft: true }]))
      mockChannelSettingRepository.create.mockReturnValue(created)

      await service.updateEmailChannelActive(tenantId, eventId, { active: true }, 'user-guid')

      expect(mockChannelSettingRepository.create).toHaveBeenCalledWith({
        eventId,
        channelCode: NotificationChannel.EMAIL,
        createdBy: 'user-guid',
      })
      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: true, isDraft: true }),
      )
    })

    it('turns the channel on without forcing a draft when the stored data is already complete', async () => {
      const existing = {
        id: 'setting-uuid-1',
        channelCode: NotificationChannel.EMAIL,
        active: false,
        isDraft: false,
        senderEmail: 'a@gov.bc.ca',
        templateId: 'template-uuid-1',
        to: 'recipient@gov.bc.ca',
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, active: true }]))

      await service.updateEmailChannelActive(tenantId, eventId, { active: true })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: true, isDraft: false }),
      )
    })

    it('turns the channel off without touching isDraft', async () => {
      const existing = {
        id: 'setting-uuid-1',
        channelCode: NotificationChannel.EMAIL,
        active: true,
        isDraft: true,
        senderEmail: 'a@gov.bc.ca',
        isDeleted: false,
      } as EventChannelSetting
      mockEventRepository.findOne
        .mockResolvedValueOnce(buildEvent([existing]))
        .mockResolvedValueOnce(buildEvent([{ ...existing, active: false }]))

      await service.updateEmailChannelActive(tenantId, eventId, { active: false })

      expect(mockChannelSettingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: false, isDraft: true }),
      )
    })

    it('throws when the event does not belong to the tenant', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(null)

      await expect(
        service.updateEmailChannelActive(tenantId, eventId, { active: true }),
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

    it('returns DRAFT for an active channel that still has unapplied draft edits, but still includes it in channelCodes', async () => {
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

      expect(result.channelCodes).toEqual([NotificationChannel.EMAIL])
      expect(result.status).toBe(EventStatus.DRAFT)
    })

    it('returns DRAFT when one active channel is applied but another is still a draft', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: true,
            isDraft: false,
            senderEmail: 'a@gov.bc.ca',
            isDeleted: false,
          },
          {
            channelCode: NotificationChannel.SMS,
            active: true,
            isDraft: true,
            isDeleted: false,
          },
        ]),
      )

      const result = await service.getEvent(tenantId, eventId)

      expect(result.channelCodes).toEqual([NotificationChannel.EMAIL, NotificationChannel.SMS])
      expect(result.status).toBe(EventStatus.DRAFT)
    })

    it('ignores an inactive draft channel when deriving ACTIVE', async () => {
      mockEventRepository.findOne.mockResolvedValueOnce(
        buildEvent([
          {
            channelCode: NotificationChannel.EMAIL,
            active: true,
            isDraft: false,
            senderEmail: 'a@gov.bc.ca',
            isDeleted: false,
          },
          {
            channelCode: NotificationChannel.SMS,
            active: false,
            isDraft: true,
            isDeleted: false,
          },
        ]),
      )

      const result = await service.getEvent(tenantId, eventId)

      expect(result.status).toBe(EventStatus.ACTIVE)
    })
  })
})
