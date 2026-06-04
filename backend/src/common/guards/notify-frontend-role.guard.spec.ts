import { Test, TestingModule } from '@nestjs/testing'
import {
  ExecutionContext,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NotifyFrontendRoleGuard } from './notify-frontend-role.guard'
import { ConfigService } from '@nestjs/config'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'

// Mock the parent AuthGuard class
vi.mock('@nestjs/passport', () => {
  return {
    AuthGuard: vi.fn((_strategy: string) => {
      return class {
        async canActivate(context: any) {
          // Throw UnauthorizedException if user is not authenticated (like real Passport guard)
          const request = context.switchToHttp().getRequest()
          if (!request.user) {
            throw new UnauthorizedException('Invalid or missing JWT')
          }
          return true
        }
      }
    }),
  }
})

describe('NotifyFrontendRoleGuard', () => {
  let guard: NotifyFrontendRoleGuard
  let reflector: Reflector
  let tenantsService: TenantsService
  let cstarApiClient: CstarApiClient
  let mockTenantsService: any
  let mockCstarApiClient: any

  beforeEach(async () => {
    mockTenantsService = { findByExternalId: vi.fn().mockResolvedValue(null) }
    mockCstarApiClient = {
      getUserTenants: vi.fn().mockResolvedValue(['bc-health']),
      getUserRoles: vi.fn().mockResolvedValue(['NOTIFY_VIEWER']),
    }

    const mockConfigService = {
      getOrThrow: vi.fn((key: string) => {
        const config: Record<string, string> = {
          'auth.notifyClientId': 'notify-client-123',
          'auth.frontendKeycloakIssuer': 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
        }
        return config[key] || 'default-value'
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifyFrontendRoleGuard,
        { provide: Reflector, useValue: { getAllAndOverride: vi.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: CstarApiClient, useValue: mockCstarApiClient },
      ],
    }).compile()

    guard = module.get<NotifyFrontendRoleGuard>(NotifyFrontendRoleGuard)
    reflector = module.get<Reflector>(Reflector)
    tenantsService = module.get<TenantsService>(TenantsService)
    cstarApiClient = module.get<CstarApiClient>(CstarApiClient)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('JWT Signature Validation (positive)', () => {
    it('should allow request with valid JWT from correct issuer', async () => {
      const mockTenant = { id: 'tenant-uuid-123', externalId: 'bc-health' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue(['bc-health'])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('JWT Signature Validation (negative)', () => {
    it('should reject request with invalid JWT', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: null,
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject request with missing user payload', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('Client ID (azp) Validation (positive)', () => {
    it('should allow request with matching azp claim', async () => {
      const mockTenant = { id: 'tenant-uuid-456', externalId: 'bc-health' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-456',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue(['bc-health'])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Client ID (azp) Validation (negative)', () => {
    it('should reject request with mismatched azp claim', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-789',
              azp: 'wrong-client-id',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
    })

    it('should reject request with missing azp claim', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-xyz',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('Issuer Validation (positive)', () => {
    it('should allow request with correct issuer', async () => {
      const mockTenant = { id: 'tenant-uuid-111', externalId: 'bc-health' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-111',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue(['bc-health'])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Issuer Validation (negative)', () => {
    it('should reject request with wrong issuer', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-222',
              azp: 'notify-client-123',
              iss: 'https://wrong-issuer.com/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
    })

    it('should reject request with missing issuer claim', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-333',
              azp: 'notify-client-123',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('x-tenant-id Header Validation (positive)', () => {
    it('should allow request with valid x-tenant-id header', async () => {
      const mockTenant = { id: 'tenant-uuid-444', externalId: 'bc-health' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-444',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue(['bc-health'])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('x-tenant-id Header Validation (negative)', () => {
    it('should reject request with missing x-tenant-id header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-555',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: {},
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
            user: {
              sub: 'user-666',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': '' },
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
            user: {
              sub: 'user-777',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': null },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
    })
  })

  describe('Tenant Existence (positive)', () => {
    it('should allow request when tenant exists', async () => {
      const mockTenant = { id: 'tenant-uuid-888', externalId: 'bc-health' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-888',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue(['bc-health'])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Tenant Existence (negative)', () => {
    it('should reject request when tenant does not exist', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-999',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'non-existent-tenant' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(null)

      expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
    })

    it('should reject request when tenant lookup throws error', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-aaa',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockRejectedValue(new Error('Database error'))

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })
  })

  describe('CSTAR Tenant Access (positive)', () => {
    it('should allow request when user has access to tenant in CSTAR', async () => {
      const mockTenant = { id: 'tenant-uuid-bbb', externalId: 'bc-health' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-bbb',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue(['bc-health', 'bc-other'])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should allow request when CSTAR returns multiple tenants', async () => {
      const mockTenant = { id: 'tenant-uuid-ccc', externalId: 'bc-education' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-ccc',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-education' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue([
        'bc-education',
        'bc-other',
        'bc-third',
      ])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('CSTAR Tenant Access (negative)', () => {
    it('should reject request when user does not have access to tenant in CSTAR', async () => {
      const mockTenant = { id: 'tenant-uuid-ddd', externalId: 'bc-denied' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-ddd',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-denied' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue(['bc-other', 'bc-third'])

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })

    it('should reject request when CSTAR returns empty tenant list', async () => {
      const mockTenant = { id: 'tenant-uuid-eee', externalId: 'bc-empty' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-eee',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-empty' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue([])

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })

    it('should reject request when CSTAR API call fails', async () => {
      const mockTenant = { id: 'tenant-uuid-fff', externalId: 'bc-error' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-fff',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-error' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockRejectedValue(
        new Error('CSTAR service unavailable'),
      )

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })
  })

  describe('Role-Based Access Control (positive)', () => {
    it('should allow request with required NOTIFY_VIEWER role', async () => {
      const mockTenant = { id: 'tenant-uuid-ggg', externalId: 'bc-health' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-ggg',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['NOTIFY_VIEWER'])
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue(['bc-health'])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Role Decorator Handling', () => {
    it('should allow request when no @Roles() decorator is present', async () => {
      const mockTenant = { id: 'tenant-uuid-hhh', externalId: 'bc-health' }

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-hhh',
              azp: 'notify-client-123',
              iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
            },
            headers: { 'x-tenant-id': 'bc-health' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null)
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue(['bc-health'])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })
})
