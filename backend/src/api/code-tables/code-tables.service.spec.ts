import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CodeTablesService } from './code-tables.service'
import { NotificationStatusCode } from '../notification/entities/notification-status-code.entity'
import { NotificationChannelCode } from '../notification/entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from '../notification/entities/notification-event-type-code.entity'
import { FeatureFlagCode } from '../feature-flag/entities/feature-flag-code.entity'

describe('CodeTablesService', () => {
  let service: CodeTablesService
  let statusCodeRepo: Repository<NotificationStatusCode>
  let channelCodeRepo: Repository<NotificationChannelCode>
  let eventTypeCodeRepo: Repository<NotificationEventTypeCode>
  let featureFlagCodeRepo: Repository<FeatureFlagCode>

  const mockStatusCodes: NotificationStatusCode[] = [
    {
      code: 'sent',
      description: 'Notification sent successfully',
      displayName: 'Sent',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
      sort_order: 10,
    },
    {
      code: 'failed',
      description: 'Notification failed to send',
      displayName: 'Failed',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
      sort_order: 20,
    },
    {
      code: 'pending',
      description: 'Notification pending',
      displayName: 'Pending',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
      sort_order: 30,
    },
  ]

  const mockChannelCodes: NotificationChannelCode[] = [
    {
      channelCode: 'EMAIL',
      description: 'Email notification channel',
      displayName: 'Email',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
      sort_order: 10,
    },
    {
      channelCode: 'SMS',
      description: 'SMS notification channel',
      displayName: 'SMS',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
      sort_order: 20,
    },
  ]

  const mockEventTypeCodes: NotificationEventTypeCode[] = [
    {
      eventTypeCode: 'PASSWORD_RESET',
      description: 'Password reset notification',
      displayName: 'Password Reset',
      is_mandatory: true,
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
      sort_order: 10,
    },
    {
      eventTypeCode: 'INVOICE_SENT',
      description: 'Invoice sent notification',
      displayName: 'Invoice Sent',
      is_mandatory: false,
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
      sort_order: 20,
    },
  ]

  const mockFeatureFlagCodes: FeatureFlagCode[] = [
    {
      code: 'dashboard',
      displayName: 'Dashboard',
      description: 'Enable dashboard feature',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
      sort_order: 999,
    },
    {
      code: 'sms_notifications',
      displayName: 'SMS Notifications',
      description: 'Enable SMS notification sending',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
      sort_order: 10,
    },
  ]

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodeTablesService,
        {
          provide: getRepositoryToken(NotificationStatusCode),
          useValue: {
            find: vi.fn(),
          },
        },
        {
          provide: getRepositoryToken(NotificationChannelCode),
          useValue: {
            find: vi.fn(),
          },
        },
        {
          provide: getRepositoryToken(NotificationEventTypeCode),
          useValue: {
            find: vi.fn(),
          },
        },
        {
          provide: getRepositoryToken(FeatureFlagCode),
          useValue: {
            find: vi.fn(),
          },
        },
      ],
    }).compile()

    service = module.get<CodeTablesService>(CodeTablesService)
    statusCodeRepo = module.get(getRepositoryToken(NotificationStatusCode))
    channelCodeRepo = module.get(getRepositoryToken(NotificationChannelCode))
    eventTypeCodeRepo = module.get(getRepositoryToken(NotificationEventTypeCode))
    featureFlagCodeRepo = module.get(getRepositoryToken(FeatureFlagCode))
  })

  describe('getStatuses', () => {
    it('should return all status codes transformed to CodeTableDto format', async () => {
      ;(statusCodeRepo.find as any).mockResolvedValueOnce(mockStatusCodes)

      const result = await service.getStatuses()

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        code: 'sent',
        displayName: 'Sent',
        description: 'Notification sent successfully',
        createdAt: mockStatusCodes[0].createdAt,
        createdBy: 'system',
        updatedAt: mockStatusCodes[0].updatedAt,
        updatedBy: null,
      })
      expect(statusCodeRepo.find).toHaveBeenCalledWith({
        order: { sort_order: 'ASC' },
      })
    })

    it('should return empty array when no status codes exist', async () => {
      ;(statusCodeRepo.find as any).mockResolvedValueOnce([])

      const result = await service.getStatuses()

      expect(result).toHaveLength(0)
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      ;(statusCodeRepo.find as any).mockRejectedValueOnce(error)

      await expect(service.getStatuses()).rejects.toThrow('Database error')
    })
  })

  describe('getChannels', () => {
    it('should return all channel codes transformed to CodeTableDto format', async () => {
      ;(channelCodeRepo.find as any).mockResolvedValueOnce(mockChannelCodes)

      const result = await service.getChannels()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        code: 'EMAIL',
        displayName: 'Email',
        description: 'Email notification channel',
        createdAt: mockChannelCodes[0].createdAt,
        createdBy: 'system',
        updatedAt: mockChannelCodes[0].updatedAt,
        updatedBy: null,
      })
      expect(channelCodeRepo.find).toHaveBeenCalledWith({
        order: { sort_order: 'ASC' },
      })
    })

    it('should return empty array when no channel codes exist', async () => {
      ;(channelCodeRepo.find as any).mockResolvedValueOnce([])

      const result = await service.getChannels()

      expect(result).toHaveLength(0)
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      ;(channelCodeRepo.find as any).mockRejectedValueOnce(error)

      await expect(service.getChannels()).rejects.toThrow('Database error')
    })
  })

  describe('getEventTypes', () => {
    it('should return all event type codes transformed to CodeTableDto format', async () => {
      ;(eventTypeCodeRepo.find as any).mockResolvedValueOnce(mockEventTypeCodes)

      const result = await service.getEventTypes()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        code: 'PASSWORD_RESET',
        displayName: 'Password Reset',
        description: 'Password reset notification',
        createdAt: mockEventTypeCodes[0].createdAt,
        createdBy: 'system',
        updatedAt: mockEventTypeCodes[0].updatedAt,
        updatedBy: null,
      })
      expect(eventTypeCodeRepo.find).toHaveBeenCalledWith({
        order: { sort_order: 'ASC' },
      })
    })

    it('should return empty array when no event type codes exist', async () => {
      ;(eventTypeCodeRepo.find as any).mockResolvedValueOnce([])

      const result = await service.getEventTypes()

      expect(result).toHaveLength(0)
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      ;(eventTypeCodeRepo.find as any).mockRejectedValueOnce(error)

      await expect(service.getEventTypes()).rejects.toThrow('Database error')
    })
  })

  describe('getAllCodeTables', () => {
    it('should return all code tables combined', async () => {
      ;(statusCodeRepo.find as any).mockResolvedValueOnce(mockStatusCodes)
      ;(channelCodeRepo.find as any).mockResolvedValueOnce(mockChannelCodes)
      ;(eventTypeCodeRepo.find as any).mockResolvedValueOnce(mockEventTypeCodes)
      ;(featureFlagCodeRepo.find as any).mockResolvedValueOnce(mockFeatureFlagCodes)

      const result = await service.getAllCodeTables()

      expect(result.statuses).toHaveLength(3)
      expect(result.channels).toHaveLength(2)
      expect(result.eventTypes).toHaveLength(2)
      expect(result).toEqual({
        statuses: expect.any(Array),
        channels: expect.any(Array),
        eventTypes: expect.any(Array),
        featureFlags: expect.any(Array),
      })
    })

    it('should make parallel database calls', async () => {
      ;(statusCodeRepo.find as any).mockResolvedValueOnce(mockStatusCodes)
      ;(channelCodeRepo.find as any).mockResolvedValueOnce(mockChannelCodes)
      ;(eventTypeCodeRepo.find as any).mockResolvedValueOnce(mockEventTypeCodes)
      ;(featureFlagCodeRepo.find as any).mockResolvedValueOnce(mockFeatureFlagCodes)

      await service.getAllCodeTables()

      expect(statusCodeRepo.find).toHaveBeenCalled()
      expect(channelCodeRepo.find).toHaveBeenCalled()
      expect(eventTypeCodeRepo.find).toHaveBeenCalled()
      expect(featureFlagCodeRepo.find).toHaveBeenCalled()
    })

    it('should handle partial failures', async () => {
      ;(statusCodeRepo.find as any).mockResolvedValueOnce(mockStatusCodes)
      ;(channelCodeRepo.find as any).mockRejectedValueOnce(new Error('Channel lookup failed'))
      ;(eventTypeCodeRepo.find as any).mockResolvedValueOnce(mockEventTypeCodes)

      await expect(service.getAllCodeTables()).rejects.toThrow('Channel lookup failed')
    })
  })
})
