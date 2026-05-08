import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { vi } from 'vitest'
import { TenantGuard } from './tenant.guard'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { ClientTenantMappingService } from '../../api/admin/client-tenant-mappings/client-tenant-mapping.service'

// Type for request object with guard-added properties
interface MockRequest {
  headers: Record<string, string>
  method: string
  url: string
  tenant?: any
  accessibleTenants?: any[]
  kongConsumerId?: string
  clientId?: string
  userGuid?: string
}

describe('TenantGuard', () => {
  let guard: TenantGuard

  const mockTenantsService = {
    findOne: vi.fn(),
    findByExternalId: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
  }

  const mockClientTenantMappingService = {
    findTenantsByClientId: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantGuard,
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
        {
          provide: ClientTenantMappingService,
          useValue: mockClientTenantMappingService,
        },
      ],
    }).compile()

    guard = module.get<TenantGuard>(TenantGuard)
    vi.clearAllMocks()
  })

  describe('Kong authentication', () => {
    it('should authenticate with Kong headers', async () => {
      const mockTenant = {
        id: 'uuid-1',
        name: 'test-tenant',
        slug: 'test-tenant',
        externalId: 'kong-id-123',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      }

      mockClientTenantMappingService.findTenantsByClientId.mockResolvedValue(['uuid-1'])
      mockTenantsService.findOne.mockResolvedValue(mockTenant)

      const request: MockRequest = {
        headers: {
          'x-consumer-username': 'test-tenant',
          'x-consumer-id': 'kong-id-123',
        },
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockClientTenantMappingService.findTenantsByClientId).toHaveBeenCalledWith(
        'kong-id-123',
      )
      expect(mockTenantsService.findOne).toHaveBeenCalledWith('uuid-1')
      expect(request.tenant).toEqual(mockTenant)
      expect(request.kongConsumerId).toBe('kong-id-123')
      expect(request.clientId).toBe('kong-id-123')
    })

    it('should throw UnauthorizedException if tenant not found by Kong client', async () => {
      mockClientTenantMappingService.findTenantsByClientId.mockResolvedValue([])

      const request: MockRequest = {
        headers: {
          'x-consumer-username': 'unknown-tenant',
          'x-consumer-id': 'kong-id-456',
        },
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
      expect(mockClientTenantMappingService.findTenantsByClientId).toHaveBeenCalledWith(
        'kong-id-456',
      )
    })

    it('should throw UnauthorizedException if Kong client mapping fails', async () => {
      mockClientTenantMappingService.findTenantsByClientId.mockRejectedValue(
        new Error('Database error'),
      )

      const request: MockRequest = {
        headers: {
          'x-consumer-username': 'failing-tenant',
          'x-consumer-id': 'kong-id-789',
        },
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('JWT authentication', () => {
    it('should authenticate with valid JWT Bearer token for frontend user', async () => {
      const mockTenant = {
        id: 'uuid-3',
        name: 'test-tenant',
        slug: 'test-tenant',
        externalId: 'user-guid-123',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      }

      // JWT with sub claim 'user-guid-123'
      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWd1aWQtMTIzIiwiaWF0IjoxNzc1NzYxMjQzLCJleHAiOjE3NzU4NDc2NDN9.test'

      mockTenantsService.findByExternalId.mockResolvedValue(mockTenant)

      const request: MockRequest = {
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockTenantsService.findByExternalId).toHaveBeenCalledWith('user-guid-123')
      expect(request.tenant).toEqual(mockTenant)
      expect(request.userGuid).toBe('user-guid-123')
    })

    it('should throw UnauthorizedException if tenant not found for user JWT', async () => {
      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1bmtub3duLXVzZXIiLCJpYXQiOjE3NzU3NjEyNDMsImV4cCI6MTc3NTg0NzY0M30.test'

      mockTenantsService.findByExternalId.mockResolvedValue(null)

      const request: MockRequest = {
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
      expect(mockTenantsService.findByExternalId).toHaveBeenCalledWith('unknown-user')
    })

    it('should authenticate with valid JWT Bearer token for service client', async () => {
      const mockTenant = {
        id: 'uuid-4',
        name: 'service-tenant',
        slug: 'service-tenant',
        externalId: 'client-123',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      }

      // JWT with azp claim (service client from client credentials flow)
      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbGllbnQtMTIzIiwiYXpwIjoiY2xpZW50LTEyMyIsImlhdCI6MTc3NTc2MTI0MywiZXhwIjoxNzc1ODQ3NjQzfQ.test'

      mockClientTenantMappingService.findTenantsByClientId.mockResolvedValue(['uuid-4'])
      mockTenantsService.findOne.mockResolvedValue(mockTenant)

      const request: MockRequest = {
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockClientTenantMappingService.findTenantsByClientId).toHaveBeenCalledWith(
        'client-123',
      )
      expect(mockTenantsService.findOne).toHaveBeenCalledWith('uuid-4')
      expect(request.tenant).toEqual(mockTenant)
      expect(request.clientId).toBe('client-123')
    })

    it('should throw UnauthorizedException if service client has no tenant mapping', async () => {
      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1bmF1dGhvcml6ZWQtY2xpZW50IiwiYXpwIjoidW5hdXRob3JpemVkLWNsaWVudCIsImlhdCI6MTc3NTc2MTI0MywiZXhwIjoxNzc1ODQ3NjQzfQ.test'

      mockClientTenantMappingService.findTenantsByClientId.mockResolvedValue([])

      const request: MockRequest = {
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
      expect(mockClientTenantMappingService.findTenantsByClientId).toHaveBeenCalledWith(
        'unauthorized-client',
      )
    })

    it('should throw UnauthorizedException for invalid JWT format', async () => {
      const invalidToken = 'invalid.jwt.format.extra'

      const request: MockRequest = {
        headers: {
          authorization: `Bearer ${invalidToken}`,
        },
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException if JWT missing "sub" claim', async () => {
      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzU3NjEyNDMsImV4cCI6MTc3NTg0NzY0M30.test'

      const request: MockRequest = {
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('No credentials', () => {
    it('should throw BadRequestException if no Kong headers or JWT provided', async () => {
      const request: MockRequest = {
        headers: {},
        method: 'POST',
        url: '/api/test',
      }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
    })
  })
})
