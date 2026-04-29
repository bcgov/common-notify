import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { CodeTablesController } from './code-tables.controller'
import { CodeTablesService, CodeTableItemDto, CodeTablesResponseDto } from './code-tables.service'

describe('CodeTablesController', () => {
  let controller: CodeTablesController
  let service: CodeTablesService

  const mockStatuses: CodeTableItemDto[] = [
    { id: 'sent', label: 'Sent', description: 'sent' },
    { id: 'failed', label: 'Failed', description: 'failed' },
    { id: 'pending', label: 'Pending', description: 'pending' },
  ]

  const mockChannels: CodeTableItemDto[] = [
    { id: 'EMAIL', label: 'Email', description: 'EMAIL' },
    { id: 'SMS', label: 'SMS', description: 'SMS' },
  ]

  const mockEventTypes: CodeTableItemDto[] = [
    { id: 'PASSWORD_RESET', label: 'Password Reset', description: 'PASSWORD_RESET' },
    { id: 'INVOICE_SENT', label: 'Invoice Sent', description: 'INVOICE_SENT' },
  ]

  const mockCodeTablesResponse: CodeTablesResponseDto = {
    statuses: mockStatuses,
    channels: mockChannels,
    eventTypes: mockEventTypes,
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CodeTablesController],
      providers: [
        {
          provide: CodeTablesService,
          useValue: {
            getAllCodeTables: vi.fn(),
            getStatuses: vi.fn(),
            getChannels: vi.fn(),
            getEventTypes: vi.fn(),
          },
        },
      ],
    }).compile()

    controller = module.get<CodeTablesController>(CodeTablesController)
    service = module.get(CodeTablesService)
  })

  describe('getAllCodeTables', () => {
    it('should return all code tables', async () => {
      vi.mocked(service.getAllCodeTables).mockResolvedValueOnce(mockCodeTablesResponse)

      const result = await controller.getAllCodeTables()

      expect(result).toEqual(mockCodeTablesResponse)
      expect(service.getAllCodeTables).toHaveBeenCalledTimes(1)
    })

    it('should handle service errors', async () => {
      const error = new Error('Service error')
      vi.mocked(service.getAllCodeTables).mockRejectedValueOnce(error)

      await expect(controller.getAllCodeTables()).rejects.toThrow('Service error')
    })
  })

  describe('getStatuses', () => {
    it('should return status codes', async () => {
      vi.mocked(service.getStatuses).mockResolvedValueOnce(mockStatuses)

      const result = await controller.getStatuses()

      expect(result).toEqual(mockStatuses)
      expect(service.getStatuses).toHaveBeenCalledTimes(1)
    })

    it('should return empty array when no statuses exist', async () => {
      vi.mocked(service.getStatuses).mockResolvedValueOnce([])

      const result = await controller.getStatuses()

      expect(result).toHaveLength(0)
    })

    it('should handle service errors', async () => {
      const error = new Error('Database error')
      vi.mocked(service.getStatuses).mockRejectedValueOnce(error)

      await expect(controller.getStatuses()).rejects.toThrow('Database error')
    })
  })

  describe('getChannels', () => {
    it('should return channel codes', async () => {
      vi.mocked(service.getChannels).mockResolvedValueOnce(mockChannels)

      const result = await controller.getChannels()

      expect(result).toEqual(mockChannels)
      expect(service.getChannels).toHaveBeenCalledTimes(1)
    })

    it('should return empty array when no channels exist', async () => {
      vi.mocked(service.getChannels).mockResolvedValueOnce([])

      const result = await controller.getChannels()

      expect(result).toHaveLength(0)
    })

    it('should handle service errors', async () => {
      const error = new Error('Database error')
      vi.mocked(service.getChannels).mockRejectedValueOnce(error)

      await expect(controller.getChannels()).rejects.toThrow('Database error')
    })
  })

  describe('getEventTypes', () => {
    it('should return event type codes', async () => {
      vi.mocked(service.getEventTypes).mockResolvedValueOnce(mockEventTypes)

      const result = await controller.getEventTypes()

      expect(result).toEqual(mockEventTypes)
      expect(service.getEventTypes).toHaveBeenCalledTimes(1)
    })

    it('should return empty array when no event types exist', async () => {
      vi.mocked(service.getEventTypes).mockResolvedValueOnce([])

      const result = await controller.getEventTypes()

      expect(result).toHaveLength(0)
    })

    it('should handle service errors', async () => {
      const error = new Error('Database error')
      vi.mocked(service.getEventTypes).mockRejectedValueOnce(error)

      await expect(controller.getEventTypes()).rejects.toThrow('Database error')
    })
  })

  describe('all endpoints', () => {
    it('should handle multiple concurrent requests', async () => {
      vi.mocked(service.getAllCodeTables).mockResolvedValueOnce(mockCodeTablesResponse)
      vi.mocked(service.getStatuses).mockResolvedValueOnce(mockStatuses)
      vi.mocked(service.getChannels).mockResolvedValueOnce(mockChannels)
      vi.mocked(service.getEventTypes).mockResolvedValueOnce(mockEventTypes)

      const results = await Promise.all([
        controller.getAllCodeTables(),
        controller.getStatuses(),
        controller.getChannels(),
        controller.getEventTypes(),
      ])

      expect(results).toHaveLength(4)
      expect(results[0]).toEqual(mockCodeTablesResponse)
      expect(results[1]).toEqual(mockStatuses)
      expect(results[2]).toEqual(mockChannels)
      expect(results[3]).toEqual(mockEventTypes)
    })
  })
})
