import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NotifyServiceGuard } from './notify-service.guard'
import { ConfigService } from '@nestjs/config'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { ClientTenantMappingService } from '../../api/admin/client-tenant-mappings/client-tenant-mapping.service'

// Mock the parent AuthGuard class
vi.mock('@nestjs/passport', () => {
  return {
    AuthGuard: vi.fn((_strategy: string) => {
      return class {
        async canActivate(context: any) {
          // Return false if user is not authenticated
          const request = context.switchToHttp().getRequest()
          return !!request.user
        }
      }
    }),
  }
})

describe('NotifyServiceGuard', () => {
  let guard: NotifyServiceGuard
  let tenantsService: TenantsService
  let clientTenantMappingService: ClientTenantMappingService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifyServiceGuard,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: vi.fn((key: string) => {
              const config: Record<string, string> = {
                'auth.apiGatewayKeycloakIssuer': 'https://keycloak.example.com/realms/service',
              }
              return config[key] || 'default-value'
            }),
          },
        },
        { provide: TenantsService, useValue: { findByExternalId: vi.fn() } },
        { provide: ClientTenantMappingService, useValue: { findTenantsByClientId: vi.fn() } },
      ],
    }).compile()

    guard = module.get<NotifyServiceGuard>(NotifyServiceGuard)
    tenantsService = module.get<TenantsService>(TenantsService)
    clientTenantMappingService = module.get<ClientTenantMappingService>(ClientTenantMappingService)
  })

  describe('x-tenant-id Header Validation (positive)', () => {
    it('should allow request with valid x-tenant-id header', async () => {
      const mockTenant = { id: 'tenant-uuid-123', externalId: 'tenant-123' }
      const mockMapping = ['tenant-uuid-123']

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-123',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJjbGllbnQtc2VydmljZSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsuZXhhbXBsZS5jb20vcmVhbG1zL3NlcnZpY2UifQ.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(clientTenantMappingService, 'findTenantsByClientId').mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should allow valid request with proper JWT structure', async () => {
      const mockTenant = { id: 'tenant-uuid-456', externalId: 'tenant-456' }
      const mockMapping = ['tenant-uuid-456']

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-456',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJhcGktc2VydmljZSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsuZXhhbXBsZS5jb20vcmVhbG1zL3NlcnZpY2UifQ.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(clientTenantMappingService, 'findTenantsByClientId').mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('x-tenant-id Header Validation (negative)', () => {
    it('should reject request with missing x-tenant-id header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer token' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
    })

    it('should reject request with empty x-tenant-id header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': '', authorization: 'Bearer token' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
    })

    it('should reject request with null x-tenant-id header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': null, authorization: 'Bearer token' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
    })
  })

  describe('Authorization Header and JWT Decoding (positive)', () => {
    it('should accept valid Bearer token format', async () => {
      const mockTenant = { id: 'tenant-uuid-789', externalId: 'tenant-789' }
      const mockMapping = ['tenant-uuid-789']

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-789',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJjbGllbnQtc2VydmljZSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsuZXhhbXBsZS5jb20vcmVhbG1zL3NlcnZpY2UifQ.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(clientTenantMappingService, 'findTenantsByClientId').mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Authorization Header and JWT Decoding (negative)', () => {
    it('should reject request with missing Authorization header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'tenant-123' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request with wrong Bearer scheme', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-123',
              authorization: 'Basic dXNlcjpwYXNz',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request with empty Bearer token', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-123',
              authorization: 'Bearer ',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request with malformed JWT', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-123',
              authorization: 'Bearer malformed-jwt',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request with JWT with wrong number of parts', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-123',
              authorization: 'Bearer header.payload',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('Issuer Validation', () => {
    it('should accept request with correct issuer', async () => {
      const mockTenant = { id: 'tenant-uuid-111', externalId: 'tenant-111' }
      const mockMapping = ['tenant-uuid-111']

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-111',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJjbGllbnQtc2VydmljZSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsuZXhhbXBsZS5jb20vcmVhbG1zL3NlcnZpY2UifQ.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(clientTenantMappingService, 'findTenantsByClientId').mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should reject request with wrong issuer', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-111',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJjbGllbnQtc2VydmljZSIsImlzcyI6Imh0dHBzOi8vd3JvbmcuaXNzdWVyLmNvbSJ9.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request with missing issuer claim', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-111',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJjbGllbnQtc2VydmljZSJ9.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('Client ID (azp) Extraction and Validation', () => {
    it('should accept request with valid azp claim', async () => {
      const mockTenant = { id: 'tenant-uuid-222', externalId: 'tenant-222' }
      const mockMapping = ['tenant-uuid-222']

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-222',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJzZXJ2aWNlLWNsaWVudCIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsuZXhhbXBsZS5jb20vcmVhbG1zL3NlcnZpY2UifQ.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(clientTenantMappingService, 'findTenantsByClientId').mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should reject request with missing azp claim', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-222',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2tleWNsb2FrLmV4YW1wbGUuY29tL3JlYWxtcy9zZXJ2aWNlIn0.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('Tenant Lookup (positive)', () => {
    it('should find tenant by external ID', async () => {
      const mockTenant = { id: 'tenant-uuid-333', externalId: 'external-tenant-333' }
      const mockMapping = ['tenant-uuid-333']

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'external-tenant-333',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJjbGllbnQtc2VydmljZSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsuZXhhbXBsZS5jb20vcmVhbG1zL3NlcnZpY2UifQ.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(clientTenantMappingService, 'findTenantsByClientId').mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(tenantsService.findByExternalId).toHaveBeenCalledWith('external-tenant-333')
    })
  })

  describe('Tenant Lookup (negative)', () => {
    it('should reject request when tenant not found', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'non-existent-tenant',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJjbGllbnQtc2VydmljZSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsuZXhhbXBsZS5jb20vcmVhbG1zL3NlcnZpY2UifQ.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(null)

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })

    it('should reject request when tenant lookup fails with error', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-123',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJjbGllbnQtc2VydmljZSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsuZXhhbXBsZS5jb20vcmVhbG1zL3NlcnZpY2UifQ.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockRejectedValue(new Error('Database error'))

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })
  })

  describe('Client-Tenant Mapping (positive)', () => {
    it('should allow authorized client', async () => {
      const mockTenant = { id: 'tenant-uuid-444', externalId: 'tenant-444' }
      const mockMapping = ['tenant-uuid-444']

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-444',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJhdXRob3JpemVkLWNsaWVudCIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsuZXhhbXBsZS5jb20vcmVhbG1zL3NlcnZpY2UifQ.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(clientTenantMappingService, 'findTenantsByClientId').mockResolvedValue(mockMapping)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Client-Tenant Mapping (negative)', () => {
    it('should reject unauthorized client', async () => {
      const mockTenant = { id: 'tenant-uuid-555', externalId: 'tenant-555' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-tenant-id': 'tenant-555',
              authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhenAiOiJ1bmF1dGhvcml6ZWQtY2xpZW50IiwiaXNzIjoiaHR0cHM6Ly9rZXljbG9hay5leGFtcGxlLmNvbS9yZWFsbXMvc2VydmljZSJ9.signature',
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(clientTenantMappingService, 'findTenantsByClientId').mockResolvedValue([])

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })
  })
})
