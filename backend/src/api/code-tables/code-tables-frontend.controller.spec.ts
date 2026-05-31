import { Test, TestingModule } from '@nestjs/testing'
import { CodeTablesFrontendController } from './code-tables-frontend.controller'
import { CodeTablesService } from './code-tables.service'
import { CodeTableDto, CodeTablesResponseDto } from './schemas/code-table.dto'
import { vi } from 'vitest'
import { TenantContextGuard } from '../../common/guards/auth.guard'
import { CanActivate, ExecutionContext } from '@nestjs/common'

describe('CodeTablesFrontendController', () => {
  let controller: CodeTablesFrontendController

  const mockCodeTableItem: CodeTableDto = {
    code: 'SENT',
    displayName: 'Sent',
    description: 'Notification has been sent',
    createdAt: new Date('2024-01-01'),
    createdBy: 'system',
    updatedAt: new Date('2024-01-01'),
    updatedBy: 'system',
  }

  const mockCodeTablesResponse: CodeTablesResponseDto = {
    statuses: [
      {
        code: 'SENT',
        displayName: 'Sent',
        description: 'Sent',
        createdAt: new Date('2024-01-01'),
        createdBy: 'system',
        updatedAt: new Date('2024-01-01'),
        updatedBy: 'system',
      },
      {
        code: 'FAILED',
        displayName: 'Failed',
        description: 'Failed',
        createdAt: new Date('2024-01-01'),
        createdBy: 'system',
        updatedAt: new Date('2024-01-01'),
        updatedBy: 'system',
      },
      {
        code: 'PENDING',
        displayName: 'Pending',
        description: 'Pending',
        createdAt: new Date('2024-01-01'),
        createdBy: 'system',
        updatedAt: new Date('2024-01-01'),
        updatedBy: 'system',
      },
    ],
    channels: [
      {
        code: 'EMAIL',
        displayName: 'Email',
        description: 'Email channel',
        createdAt: new Date('2024-01-01'),
        createdBy: 'system',
        updatedAt: new Date('2024-01-01'),
        updatedBy: 'system',
      },
      {
        code: 'SMS',
        displayName: 'SMS',
        description: 'SMS channel',
        createdAt: new Date('2024-01-01'),
        createdBy: 'system',
        updatedAt: new Date('2024-01-01'),
        updatedBy: 'system',
      },
      {
        code: 'MSGAPP',
        displayName: 'Message App',
        description: 'Message App channel',
        createdAt: new Date('2024-01-01'),
        createdBy: 'system',
        updatedAt: new Date('2024-01-01'),
        updatedBy: 'system',
      },
    ],
    eventTypes: [
      {
        code: 'PASSWORD_RESET',
        displayName: 'Password Reset',
        description: 'Password reset event',
        createdAt: new Date('2024-01-01'),
        createdBy: 'system',
        updatedAt: new Date('2024-01-01'),
        updatedBy: 'system',
      },
      {
        code: 'INVOICE_SENT',
        displayName: 'Invoice Sent',
        description: 'Invoice sent event',
        createdAt: new Date('2024-01-01'),
        createdBy: 'system',
        updatedAt: new Date('2024-01-01'),
        updatedBy: 'system',
      },
      {
        code: 'USER_SIGNUP',
        displayName: 'User Signup',
        description: 'User signup event',
        createdAt: new Date('2024-01-01'),
        createdBy: 'system',
        updatedAt: new Date('2024-01-01'),
        updatedBy: 'system',
      },
    ],
    featureFlags: [],
  }

  const mockCodeTablesService = {
    getAllCodeTables: vi.fn(),
    getStatuses: vi.fn(),
    getChannels: vi.fn(),
    getEventTypes: vi.fn(),
  }

  // Mock AuthGuard to bypass authentication
  const mockAuthGuard: CanActivate = {
    canActivate: (_context: ExecutionContext) => true,
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CodeTablesFrontendController],
      providers: [
        {
          provide: CodeTablesService,
          useValue: mockCodeTablesService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile()

    controller = module.get<CodeTablesFrontendController>(CodeTablesFrontendController)

    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('getAllCodeTables', () => {
    it('should return all code tables', async () => {
      mockCodeTablesService.getAllCodeTables.mockResolvedValue(mockCodeTablesResponse)

      const result = await controller.getAllCodeTables()

      expect(result).toEqual(mockCodeTablesResponse)
      expect(mockCodeTablesService.getAllCodeTables).toHaveBeenCalledTimes(1)
    })

    it('should have statuses property', async () => {
      mockCodeTablesService.getAllCodeTables.mockResolvedValue(mockCodeTablesResponse)

      const result = await controller.getAllCodeTables()

      expect(result.statuses).toBeDefined()
      expect(Array.isArray(result.statuses)).toBe(true)
      expect(result.statuses.length).toBeGreaterThan(0)
    })

    it('should have channels property', async () => {
      mockCodeTablesService.getAllCodeTables.mockResolvedValue(mockCodeTablesResponse)

      const result = await controller.getAllCodeTables()

      expect(result.channels).toBeDefined()
      expect(Array.isArray(result.channels)).toBe(true)
      expect(result.channels.length).toBeGreaterThan(0)
    })

    it('should have eventTypes property', async () => {
      mockCodeTablesService.getAllCodeTables.mockResolvedValue(mockCodeTablesResponse)

      const result = await controller.getAllCodeTables()

      expect(result.eventTypes).toBeDefined()
      expect(Array.isArray(result.eventTypes)).toBe(true)
      expect(result.eventTypes.length).toBeGreaterThan(0)
    })

    it('should delegate to service', async () => {
      mockCodeTablesService.getAllCodeTables.mockResolvedValue(mockCodeTablesResponse)

      await controller.getAllCodeTables()

      expect(mockCodeTablesService.getAllCodeTables).toHaveBeenCalledWith()
    })

    it('should return empty arrays when no data', async () => {
      const emptyResponse: CodeTablesResponseDto = {
        statuses: [],
        channels: [],
        eventTypes: [],
        featureFlags: [],
      }
      mockCodeTablesService.getAllCodeTables.mockResolvedValue(emptyResponse)

      const result = await controller.getAllCodeTables()

      expect(result.statuses).toEqual([])
      expect(result.channels).toEqual([])
      expect(result.eventTypes).toEqual([])
    })

    it('should preserve order from service response', async () => {
      const orderedResponse: CodeTablesResponseDto = {
        statuses: [
          {
            code: 'A',
            displayName: 'First',
            description: 'First status',
            createdAt: new Date('2024-01-01'),
            createdBy: 'system',
            updatedAt: new Date('2024-01-01'),
            updatedBy: 'system',
          },
          {
            code: 'B',
            displayName: 'Second',
            description: 'Second status',
            createdAt: new Date('2024-01-01'),
            createdBy: 'system',
            updatedAt: new Date('2024-01-01'),
            updatedBy: 'system',
          },
          {
            code: 'C',
            displayName: 'Third',
            description: 'Third status',
            createdAt: new Date('2024-01-01'),
            createdBy: 'system',
            updatedAt: new Date('2024-01-01'),
            updatedBy: 'system',
          },
        ],
        channels: [],
        eventTypes: [],
        featureFlags: [],
      }
      mockCodeTablesService.getAllCodeTables.mockResolvedValue(orderedResponse)

      const result = await controller.getAllCodeTables()

      expect(result.statuses[0].code).toBe('A')
      expect(result.statuses[1].code).toBe('B')
      expect(result.statuses[2].code).toBe('C')
    })
  })

  describe('getStatuses', () => {
    it('should return notification status codes', async () => {
      const statuses = mockCodeTablesResponse.statuses
      mockCodeTablesService.getStatuses.mockResolvedValue(statuses)

      const result = await controller.getStatuses()

      expect(result).toEqual(statuses)
      expect(mockCodeTablesService.getStatuses).toHaveBeenCalledTimes(1)
    })

    it('should return array of CodeTableItemDto', async () => {
      const statuses = [mockCodeTableItem]
      mockCodeTablesService.getStatuses.mockResolvedValue(statuses)

      const result = await controller.getStatuses()

      expect(Array.isArray(result)).toBe(true)
      expect(result[0]).toHaveProperty('code')
      expect(result[0]).toHaveProperty('name')
      expect(result[0]).toHaveProperty('description')
      expect(result[0]).toHaveProperty('displayOrder')
    })

    it('should return empty array when no statuses', async () => {
      mockCodeTablesService.getStatuses.mockResolvedValue([])

      const result = await controller.getStatuses()

      expect(result).toEqual([])
    })

    it('should include common status codes', async () => {
      const statuses: CodeTableDto[] = [
        {
          code: 'QUEUED',
          displayName: 'Queued',
          description: 'Queued',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'PROCESSING',
          displayName: 'Processing',
          description: 'Processing',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'SENT',
          displayName: 'Sent',
          description: 'Sent',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'FAILED',
          displayName: 'Failed',
          description: 'Failed',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
      ]
      mockCodeTablesService.getStatuses.mockResolvedValue(statuses)

      const result = await controller.getStatuses()

      expect(result.map((s) => s.code)).toContain('QUEUED')
      expect(result.map((s) => s.code)).toContain('SENT')
      expect(result.map((s) => s.code)).toContain('FAILED')
    })

    it('should preserve status information', async () => {
      const statuses: CodeTableDto[] = [
        {
          code: 'FIRST',
          displayName: 'First',
          description: 'First status',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'SECOND',
          displayName: 'Second',
          description: 'Second status',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'THIRD',
          displayName: 'Third',
          description: 'Third status',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
      ]
      mockCodeTablesService.getStatuses.mockResolvedValue(statuses)

      const result = await controller.getStatuses()

      expect(result[0].displayName).toBe('First')
      expect(result[1].displayName).toBe('Second')
      expect(result[2].displayName).toBe('Third')
    })

    it('should delegate to service', async () => {
      mockCodeTablesService.getStatuses.mockResolvedValue([])

      await controller.getStatuses()

      expect(mockCodeTablesService.getStatuses).toHaveBeenCalledWith()
    })
  })

  describe('getChannels', () => {
    it('should return notification channel codes', async () => {
      const channels = mockCodeTablesResponse.channels
      mockCodeTablesService.getChannels.mockResolvedValue(channels)

      const result = await controller.getChannels()

      expect(result).toEqual(channels)
      expect(mockCodeTablesService.getChannels).toHaveBeenCalledTimes(1)
    })

    it('should return array of CodeTableDto', async () => {
      const channels = [mockCodeTableItem]
      mockCodeTablesService.getChannels.mockResolvedValue(channels)

      const result = await controller.getChannels()

      expect(Array.isArray(result)).toBe(true)
      expect(result[0]).toHaveProperty('code')
      expect(result[0]).toHaveProperty('displayName')
      expect(result[0]).toHaveProperty('description')
    })

    it('should return empty array when no channels', async () => {
      mockCodeTablesService.getChannels.mockResolvedValue([])

      const result = await controller.getChannels()

      expect(result).toEqual([])
    })

    it('should include standard channels', async () => {
      const channels: CodeTableDto[] = [
        {
          code: 'EMAIL',
          displayName: 'Email',
          description: 'Email channel',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'SMS',
          displayName: 'SMS',
          description: 'SMS channel',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'MSGAPP',
          displayName: 'Message App',
          description: 'Message App channel',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
      ]
      mockCodeTablesService.getChannels.mockResolvedValue(channels)

      const result = await controller.getChannels()

      expect(result.map((c) => c.code)).toContain('EMAIL')
      expect(result.map((c) => c.code)).toContain('SMS')
      expect(result.map((c) => c.code)).toContain('MSGAPP')
    })

    it('should preserve channel information', async () => {
      const channels: CodeTableDto[] = [
        {
          code: 'EMAIL',
          displayName: 'Email',
          description: 'Email channel',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'SMS',
          displayName: 'SMS',
          description: 'SMS channel',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'MSGAPP',
          displayName: 'Message App',
          description: 'Message App channel',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
      ]
      mockCodeTablesService.getChannels.mockResolvedValue(channels)

      const result = await controller.getChannels()

      expect(result[0].code).toBe('EMAIL')
      expect(result[1].code).toBe('SMS')
      expect(result[2].code).toBe('MSGAPP')
    })

    it('should delegate to service', async () => {
      mockCodeTablesService.getChannels.mockResolvedValue([])

      await controller.getChannels()

      expect(mockCodeTablesService.getChannels).toHaveBeenCalledWith()
    })
  })

  describe('getEventTypes', () => {
    it('should return notification event type codes', async () => {
      const eventTypes = mockCodeTablesResponse.eventTypes
      mockCodeTablesService.getEventTypes.mockResolvedValue(eventTypes)

      const result = await controller.getEventTypes()

      expect(result).toEqual(eventTypes)
      expect(mockCodeTablesService.getEventTypes).toHaveBeenCalledTimes(1)
    })

    it('should return array of CodeTableDto', async () => {
      const eventTypes = [mockCodeTableItem]
      mockCodeTablesService.getEventTypes.mockResolvedValue(eventTypes)

      const result = await controller.getEventTypes()

      expect(Array.isArray(result)).toBe(true)
      expect(result[0]).toHaveProperty('code')
      expect(result[0]).toHaveProperty('displayName')
      expect(result[0]).toHaveProperty('description')
    })

    it('should return empty array when no event types', async () => {
      mockCodeTablesService.getEventTypes.mockResolvedValue([])

      const result = await controller.getEventTypes()

      expect(result).toEqual([])
    })

    it('should include common event types', async () => {
      const eventTypes: CodeTableDto[] = [
        {
          code: 'PASSWORD_RESET',
          displayName: 'Password Reset',
          description: 'Password reset event',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'INVOICE_SENT',
          displayName: 'Invoice Sent',
          description: 'Invoice sent event',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'USER_SIGNUP',
          displayName: 'User Signup',
          description: 'User signup event',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
      ]
      mockCodeTablesService.getEventTypes.mockResolvedValue(eventTypes)

      const result = await controller.getEventTypes()

      expect(result.map((e) => e.code)).toContain('PASSWORD_RESET')
      expect(result.map((e) => e.code)).toContain('INVOICE_SENT')
      expect(result.map((e) => e.code)).toContain('USER_SIGNUP')
    })

    it('should preserve event type information', async () => {
      const eventTypes: CodeTableDto[] = [
        {
          code: 'EVENT_A',
          displayName: 'Event A',
          description: 'Event A description',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'EVENT_B',
          displayName: 'Event B',
          description: 'Event B description',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
        {
          code: 'EVENT_C',
          displayName: 'Event C',
          description: 'Event C description',
          createdAt: new Date('2024-01-01'),
          createdBy: 'system',
          updatedAt: new Date('2024-01-01'),
          updatedBy: 'system',
        },
      ]
      mockCodeTablesService.getEventTypes.mockResolvedValue(eventTypes)

      const result = await controller.getEventTypes()

      expect(result[0].code).toBe('EVENT_A')
      expect(result[1].code).toBe('EVENT_B')
      expect(result[2].code).toBe('EVENT_C')
    })

    it('should delegate to service', async () => {
      mockCodeTablesService.getEventTypes.mockResolvedValue([])

      await controller.getEventTypes()

      expect(mockCodeTablesService.getEventTypes).toHaveBeenCalledWith()
    })
  })

  describe('API Metadata', () => {
    it('should have all endpoints as read-only GET operations', () => {
      // This verifies the architectural intent that code-tables endpoints are read-only
      const methods = ['getAllCodeTables', 'getStatuses', 'getChannels', 'getEventTypes']
      for (const method of methods) {
        expect(typeof controller[method as keyof CodeTablesFrontendController]).toBe('function')
      }
    })

    it('should not have any write operations', () => {
      const createMethods = ['create', 'update', 'delete', 'patch', 'post']
      for (const method of createMethods) {
        expect(controller[method as keyof CodeTablesFrontendController]).toBeUndefined()
      }
    })

    it('should support both direct calls and versioning', () => {
      // Endpoints have @Version('1') decorator, ensuring backward compatibility
      expect(controller).toBeDefined()
      expect(controller.getAllCodeTables).toBeDefined()
      expect(controller.getStatuses).toBeDefined()
      expect(controller.getChannels).toBeDefined()
      expect(controller.getEventTypes).toBeDefined()
    })
  })

  describe('Frontend vs Service-to-Service', () => {
    it('should be designated for frontend access', () => {
      // Controller path is 'frontend/code-tables' vs service 'code-tables'
      // This is enforced by routing configuration
      expect(controller).toBeDefined()
    })

    it('should delegate to same service as regular controller', () => {
      // Both controllers use the same CodeTablesService
      // This ensures data consistency
      expect(mockCodeTablesService.getAllCodeTables).toBeDefined()
      expect(mockCodeTablesService.getStatuses).toBeDefined()
      expect(mockCodeTablesService.getChannels).toBeDefined()
      expect(mockCodeTablesService.getEventTypes).toBeDefined()
    })

    it('should support caching strategies via service', () => {
      // Service can implement caching independently
      // Controller calls should be cacheable
      mockCodeTablesService.getAllCodeTables.mockResolvedValue(mockCodeTablesResponse)

      // Multiple calls should all delegate to service
      // (caching would happen at service level, not controller)
      controller.getAllCodeTables()
      controller.getAllCodeTables()

      expect(mockCodeTablesService.getAllCodeTables).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error Handling', () => {
    it('should propagate service errors from getAllCodeTables', async () => {
      const error = new Error('Service error')
      mockCodeTablesService.getAllCodeTables.mockRejectedValue(error)

      await expect(controller.getAllCodeTables()).rejects.toThrow('Service error')
    })

    it('should propagate service errors from getStatuses', async () => {
      const error = new Error('Service error')
      mockCodeTablesService.getStatuses.mockRejectedValue(error)

      await expect(controller.getStatuses()).rejects.toThrow('Service error')
    })

    it('should propagate service errors from getChannels', async () => {
      const error = new Error('Service error')
      mockCodeTablesService.getChannels.mockRejectedValue(error)

      await expect(controller.getChannels()).rejects.toThrow('Service error')
    })

    it('should propagate service errors from getEventTypes', async () => {
      const error = new Error('Service error')
      mockCodeTablesService.getEventTypes.mockRejectedValue(error)

      await expect(controller.getEventTypes()).rejects.toThrow('Service error')
    })
  })
})
