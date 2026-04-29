import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CodeTablesService } from './code-tables.service'
import { NotificationStatusCode } from '../../notification/entities/notification-status-code.entity'
import { NotificationChannelCode } from '../../notification/entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from '../../notification/entities/notification-event-type-code.entity'

describe('CodeTablesService', () => {
  let service: CodeTablesService
  let statusCodeRepo: Repository<NotificationStatusCode>
  let channelCodeRepo: Repository<NotificationChannelCode>
  let eventTypeCodeRepo: Repository<NotificationEventTypeCode>

  const mockStatusCodes: NotificationStatusCode[] = [
    {
      code: 'sent',
      description: 'Notification sent successfully',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
    },
    {
      code: 'failed',
      description: 'Notification failed to send',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
    },
    {
      code: 'pending',
      description: 'Notification pending',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
    },
  ]

  const mockChannelCodes: NotificationChannelCode[] = [
    {
      channelCode: 'EMAIL',
      description: 'Email notification channel',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
    },
    {
      channelCode: 'SMS',
      description: 'SMS notification channel',
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
    },
  ]

  const mockEventTypeCodes: NotificationEventTypeCode[] = [
    {
      eventTypeCode: 'PASSWORD_RESET',
      description: 'Password reset notification',
      is_mandatory: true,
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
    },
    {
      eventTypeCode: 'INVOICE_SENT',
      description: 'Invoice sent notification',
      is_mandatory: false,
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: null,
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
      ],
    }).compile()

    service = module.get<CodeTablesService>(CodeTablesService)
    statusCodeRepo = module.get(getRepositoryToken(NotificationStatusCode))
    channelCodeRepo = module.get(getRepositoryToken(NotificationChannelCode))
    eventTypeCodeRepo = module.get(getRepositoryToken(NotificationEventTypeCode))
  })

  describe('getStatuses', () => {
    it('should return all status codes transformed to CodeTableItem format', async () => {
      vi.mocked(statusCodeRepo.find).mockResolvedValueOnce(mockStatusCodes)

      const result = await service.getStatuses()

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        id: 'sent',
        label: 'Notification sent successfully',
        description: 'sent',
      })
      expect(statusCodeRepo.find).toHaveBeenCalledWith({
        order: { code: 'ASC' },
      })
    })

    it('should return empty array when no status codes exist', async () => {
      vi.mocked(statusCodeRepo.find).mockResolvedValueOnce([])

      const result = await service.getStatuses()

      expect(result).toHaveLength(0)
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      vi.mocked(statusCodeRepo.find).mockRejectedValueOnce(error)

      await expect(service.getStatuses()).rejects.toThrow('Database error')
    })
  })

  describe('getChannels', () => {
    it('should return all channel codes transformed to CodeTableItem format', async () => {
      vi.mocked(channelCodeRepo.find).mockResolvedValueOnce(mockChannelCodes)

      const result = await service.getChannels()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 'EMAIL',
        label: 'Email notification channel',
        description: 'EMAIL',
      })
      expect(channelCodeRepo.find).toHaveBeenCalledWith({
        order: { channelCode: 'ASC' },
      })
    })

    it('should return empty array when no channel codes exist', async () => {
      vi.mocked(channelCodeRepo.find).mockResolvedValueOnce([])

      const result = await service.getChannels()

      expect(result).toHaveLength(0)
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      vi.mocked(channelCodeRepo.find).mockRejectedValueOnce(error)

      await expect(service.getChannels()).rejects.toThrow('Database error')
    })
  })

  describe('getEventTypes', () => {
    it('should return all event type codes transformed to CodeTableItem format', async () => {
      vi.mocked(eventTypeCodeRepo.find).mockResolvedValueOnce(mockEventTypeCodes)

      const result = await service.getEventTypes()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 'PASSWORD_RESET',
        label: 'Password reset notification',
        description: 'PASSWORD_RESET',
      })
      expect(eventTypeCodeRepo.find).toHaveBeenCalledWith({
        order: { eventTypeCode: 'ASC' },
      })
    })

    it('should return empty array when no event type codes exist', async () => {
      vi.mocked(eventTypeCodeRepo.find).mockResolvedValueOnce([])

      const result = await service.getEventTypes()

      expect(result).toHaveLength(0)
    })

    it('should handle database errors', async () => {
      const error = new Error('Database error')
      vi.mocked(eventTypeCodeRepo.find).mockRejectedValueOnce(error)

      await expect(service.getEventTypes()).rejects.toThrow('Database error')
    })
  })

  describe('getAllCodeTables', () => {
    it('should return all code tables combined', async () => {
      vi.mocked(statusCodeRepo.find).mockResolvedValueOnce(mockStatusCodes)
      vi.mocked(channelCodeRepo.find).mockResolvedValueOnce(mockChannelCodes)
      vi.mocked(eventTypeCodeRepo.find).mockResolvedValueOnce(mockEventTypeCodes)

      const result = await service.getAllCodeTables()

      expect(result.statuses).toHaveLength(3)
      expect(result.channels).toHaveLength(2)
      expect(result.eventTypes).toHaveLength(2)
      expect(result).toEqual({
        statuses: expect.any(Array),
        channels: expect.any(Array),
        eventTypes: expect.any(Array),
      })
    })

    it('should make parallel database calls', async () => {
      statusCodeRepo.find.mockResolvedValueOnce(mockStatusCodes)
      channelCodeRepo.find.mockResolvedValueOnce(mockChannelCodes)
      eventTypeCodeRepo.find.mockResolvedValueOnce(mockEventTypeCodes)

      await service.getAllCodeTables()

      expect(statusCodeRepo.find).toHaveBeenCalled()
      expect(channelCodeRepo.find).toHaveBeenCalled()
      expect(eventTypeCodeRepo.find).toHaveBeenCalled()
    })

    it('should handle partial failures', async () => {
      statusCodeRepo.find.mockResolvedValueOnce(mockStatusCodes)
      channelCodeRepo.find.mockRejectedValueOnce(new Error('Channel lookup failed'))
      eventTypeCodeRepo.find.mockResolvedValueOnce(mockEventTypeCodes)

      await expect(service.getAllCodeTables()).rejects.toThrow('Channel lookup failed')
    })
  })
})
