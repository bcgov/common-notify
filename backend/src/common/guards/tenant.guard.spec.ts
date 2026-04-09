import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { TenantGuard } from './tenant.guard'
import { TenantsService } from '../../admin/tenants/tenants.service'

describe('TenantGuard', () => {
  let guard: TenantGuard
  let tenantsService: TenantsService

  const mockTenantsService = {
    findByKongUsername: jest.fn(),
    findByOAuth2ClientId: jest.fn(),
    create: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantGuard,
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
      ],
    }).compile()

    guard = module.get<TenantGuard>(TenantGuard)
    tenantsService = module.get<TenantsService>(TenantsService)
    jest.clearAllMocks()
  })

  describe('Kong authentication', () => {
    it('should authenticate with Kong headers', async () => {
      const mockTenant = {
        id: 1,
        name: 'test-tenant',
        kongUsername: 'test-tenant',
        oauth2ClientId: null,
      }

      mockTenantsService.findByKongUsername.mockResolvedValue(mockTenant)

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-username': 'test-tenant',
              'x-consumer-id': 'kong-id-123',
            },
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockTenantsService.findByKongUsername).toHaveBeenCalledWith('test-tenant')
      expect(mockContext.switchToHttp().getRequest().tenant).toEqual(mockTenant)
      expect(mockContext.switchToHttp().getRequest().kongConsumerId).toBe('kong-id-123')
    })

    it('should create tenant if not found by Kong username', async () => {
      const newTenant = {
        id: 2,
        name: 'new-tenant',
        kongUsername: 'new-tenant',
      }

      mockTenantsService.findByKongUsername.mockResolvedValue(null)
      mockTenantsService.create.mockResolvedValue({ tenant: newTenant })

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-username': 'new-tenant',
              'x-consumer-id': 'kong-id-456',
            },
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockTenantsService.create).toHaveBeenCalledWith(
        { name: 'new-tenant' },
        { kongUsername: 'new-tenant' },
      )
      expect(mockContext.switchToHttp().getRequest().tenant).toEqual(newTenant)
    })

    it('should throw BadRequestException if Kong tenant creation fails', async () => {
      mockTenantsService.findByKongUsername.mockResolvedValue(null)
      mockTenantsService.create.mockRejectedValue(new Error('DB error'))

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-username': 'failing-tenant',
              'x-consumer-id': 'kong-id-789',
            },
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
    })
  })

  describe('JWT authentication', () => {
    it('should authenticate with valid JWT Bearer token', async () => {
      const mockTenant = {
        id: 3,
        name: 'test-client-a',
        oauth2ClientId: 'test-client-a',
      }

      // JWT with sub claim 'test-client-a'
      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LWNsaWVudC1hIiwiaWF0IjoxNzc1NzYxMjQzLCJleHAiOjE3NzU3NjEyNDN9.test'

      mockTenantsService.findByOAuth2ClientId.mockResolvedValue(mockTenant)

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: `Bearer ${jwtToken}`,
            },
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockTenantsService.findByOAuth2ClientId).toHaveBeenCalledWith('test-client-a')
      expect(mockContext.switchToHttp().getRequest().tenant).toEqual(mockTenant)
      expect(mockContext.switchToHttp().getRequest().clientId).toBe('test-client-a')
    })

    it('should create tenant if not found by OAuth2 client ID', async () => {
      const newTenant = {
        id: 4,
        name: 'new-client',
        oauth2ClientId: 'new-client',
      }

      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJuZXctY2xpZW50IiwiaWF0IjoxNzc1NzYxMjQzLCJleHAiOjE3NzU3NjEyNDN9.test'

      mockTenantsService.findByOAuth2ClientId.mockResolvedValue(null)
      mockTenantsService.create.mockResolvedValue({ tenant: newTenant })

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: `Bearer ${jwtToken}`,
            },
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockTenantsService.create).toHaveBeenCalledWith(
        { name: 'new-client' },
        { oauth2ClientId: 'new-client' },
      )
      expect(mockContext.switchToHttp().getRequest().tenant).toEqual(newTenant)
    })

    it('should throw UnauthorizedException if JWT tenant creation fails', async () => {
      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWlsaW5nLWNsaWVudCIsImlhdCI6MTc3NTc2MTI0MywiZXhwIjoxNzc1NzYxMjQzfQ.test'

      mockTenantsService.findByOAuth2ClientId.mockResolvedValue(null)
      mockTenantsService.create.mockRejectedValue(new Error('DB error'))

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: `Bearer ${jwtToken}`,
            },
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException for invalid JWT format', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer invalid-token-format',
            },
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException if JWT missing "sub" claim', async () => {
      // JWT without 'sub' claim
      const jwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzU3NjEyNDMsImV4cCI6MTc3NTc2MTI0M30.test'

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: `Bearer ${jwtToken}`,
            },
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('Authentication failure', () => {
    it('should throw BadRequestException when no auth headers provided', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
    })

    it('should prioritize Kong headers over JWT', async () => {
      const mockTenant = {
        id: 5,
        name: 'kong-tenant',
        kongUsername: 'kong-tenant',
      }

      mockTenantsService.findByKongUsername.mockResolvedValue(mockTenant)

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-consumer-username': 'kong-tenant',
              'x-consumer-id': 'kong-id-999',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqd3QtY2xpZW50In0.test',
            },
            method: 'POST',
            url: '/api/test',
          }),
        }),
      } as ExecutionContext

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockTenantsService.findByKongUsername).toHaveBeenCalled()
      expect(mockTenantsService.findByOAuth2ClientId).not.toHaveBeenCalled()
    })
  })
})
