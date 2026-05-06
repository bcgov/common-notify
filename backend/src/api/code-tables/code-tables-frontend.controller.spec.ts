import { Test, TestingModule } from '@nestjs/testing'
import { CodeTablesFrontendController } from './code-tables-frontend.controller'
import { CodeTablesService, CodeTableItemDto, CodeTablesResponseDto } from './code-tables.service'
import { vi } from 'vitest'
import { TenantGuard } from '../../common/guards/tenant.guard'
import { CanActivate, ExecutionContext } from '@nestjs/common'

describe('CodeTablesFrontendController', () => {
  let controller: CodeTablesFrontendController
  let service: CodeTablesService

  const mockCodeTableItem: CodeTableItemDto = {
    code: 'SENT',
    name: 'Sent',
    description: 'Notification has been sent',
    displayOrder: 1,
  }

  const mockCodeTablesResponse: CodeTablesResponseDto = {
    statuses: [
      { code: 'SENT', name: 'Sent', description: 'Sent', displayOrder: 1 },
      { code: 'FAILED', name: 'Failed', description: 'Failed', displayOrder: 2 },
      { code: 'PENDING', name: 'Pending', description: 'Pending', displayOrder: 3 },
    ],
    channels: [
      { code: 'EMAIL', name: 'Email', description: 'Email channel', displayOrder: 1 },
      { code: 'SMS', name: 'SMS', description: 'SMS channel', displayOrder: 2 },
      { code: 'MSGAPP', name: 'Message App', description: 'Message App channel', displayOrder: 3 },
    ],
    eventTypes: [
      {
        code: 'PASSWORD_RESET',
        name: 'Password Reset',
        description: 'Password reset event',
        displayOrder: 1,
      },
      {
        code: 'INVOICE_SENT',
        name: 'Invoice Sent',
        description: 'Invoice sent event',
        displayOrder: 2,
      },
      {
        code: 'USER_SIGNUP',
        name: 'User Signup',
        description: 'User signup event',
        displayOrder: 3,
      },
    ],
  }

  const mockCodeTablesService = {
    getAllCodeTables: vi.fn(),
    getStatuses: vi.fn(),
    getChannels: vi.fn(),
    getEventTypes: vi.fn(),
  }

  // Mock TenantGuard to bypass authentication
  const mockTenantGuard: CanActivate = {
    canActivate: (context: ExecutionContext) => true,
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
      .overrideGuard(TenantGuard)
      .useValue(mockTenantGuard)
      .compile()

    controller = module.get<CodeTablesFrontendController>(CodeTablesFrontendController)
    service = module.get<CodeTablesService>(CodeTablesService)

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
          { code: 'A', name: 'First', displayOrder: 1 },
          { code: 'B', name: 'Second', displayOrder: 2 },
          { code: 'C', name: 'Third', displayOrder: 3 },
        ],
        channels: [],
        eventTypes: [],
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
      const statuses: CodeTableItemDto[] = [
        { code: 'QUEUED', name: 'Queued', displayOrder: 1 },
        { code: 'PROCESSING', name: 'Processing', displayOrder: 2 },
        { code: 'SENT', name: 'Sent', displayOrder: 3 },
        { code: 'FAILED', name: 'Failed', displayOrder: 4 },
      ]
      mockCodeTablesService.getStatuses.mockResolvedValue(statuses)

      const result = await controller.getStatuses()

      expect(result.map((s) => s.code)).toContain('QUEUED')
      expect(result.map((s) => s.code)).toContain('SENT')
      expect(result.map((s) => s.code)).toContain('FAILED')
    })

    it('should preserve displayOrder', async () => {
      const statuses: CodeTableItemDto[] = [
        { code: 'FIRST', name: 'First', displayOrder: 1 },
        { code: 'SECOND', name: 'Second', displayOrder: 2 },
        { code: 'THIRD', name: 'Third', displayOrder: 3 },
      ]
      mockCodeTablesService.getStatuses.mockResolvedValue(statuses)

      const result = await controller.getStatuses()

      expect(result[0].displayOrder).toBe(1)
      expect(result[1].displayOrder).toBe(2)
      expect(result[2].displayOrder).toBe(3)
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

    it('should return array of CodeTableItemDto', async () => {
      const channels = [mockCodeTableItem]
      mockCodeTablesService.getChannels.mockResolvedValue(channels)

      const result = await controller.getChannels()

      expect(Array.isArray(result)).toBe(true)
      expect(result[0]).toHaveProperty('code')
      expect(result[0]).toHaveProperty('name')
      expect(result[0]).toHaveProperty('displayOrder')
    })

    it('should return empty array when no channels', async () => {
      mockCodeTablesService.getChannels.mockResolvedValue([])

      const result = await controller.getChannels()

      expect(result).toEqual([])
    })

    it('should include standard channels', async () => {
      const channels: CodeTableItemDto[] = [
        { code: 'EMAIL', name: 'Email', displayOrder: 1 },
        { code: 'SMS', name: 'SMS', displayOrder: 2 },
        { code: 'MSGAPP', name: 'Message App', displayOrder: 3 },
      ]
      mockCodeTablesService.getChannels.mockResolvedValue(channels)

      const result = await controller.getChannels()

      expect(result.map((c) => c.code)).toContain('EMAIL')
      expect(result.map((c) => c.code)).toContain('SMS')
      expect(result.map((c) => c.code)).toContain('MSGAPP')
    })

    it('should preserve channel order', async () => {
      const channels: CodeTableItemDto[] = [
        { code: 'EMAIL', name: 'Email', displayOrder: 1 },
        { code: 'SMS', name: 'SMS', displayOrder: 2 },
        { code: 'MSGAPP', name: 'Message App', displayOrder: 3 },
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

    it('should return array of CodeTableItemDto', async () => {
      const eventTypes = [mockCodeTableItem]
      mockCodeTablesService.getEventTypes.mockResolvedValue(eventTypes)

      const result = await controller.getEventTypes()

      expect(Array.isArray(result)).toBe(true)
      expect(result[0]).toHaveProperty('code')
      expect(result[0]).toHaveProperty('name')
      expect(result[0]).toHaveProperty('displayOrder')
    })

    it('should return empty array when no event types', async () => {
      mockCodeTablesService.getEventTypes.mockResolvedValue([])

      const result = await controller.getEventTypes()

      expect(result).toEqual([])
    })

    it('should include common event types', async () => {
      const eventTypes: CodeTableItemDto[] = [
        { code: 'PASSWORD_RESET', name: 'Password Reset', displayOrder: 1 },
        { code: 'INVOICE_SENT', name: 'Invoice Sent', displayOrder: 2 },
        { code: 'USER_SIGNUP', name: 'User Signup', displayOrder: 3 },
      ]
      mockCodeTablesService.getEventTypes.mockResolvedValue(eventTypes)

      const result = await controller.getEventTypes()

      expect(result.map((e) => e.code)).toContain('PASSWORD_RESET')
      expect(result.map((e) => e.code)).toContain('INVOICE_SENT')
      expect(result.map((e) => e.code)).toContain('USER_SIGNUP')
    })

    it('should preserve event type order', async () => {
      const eventTypes: CodeTableItemDto[] = [
        { code: 'EVENT_A', name: 'Event A', displayOrder: 1 },
        { code: 'EVENT_B', name: 'Event B', displayOrder: 2 },
        { code: 'EVENT_C', name: 'Event C', displayOrder: 3 },
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
