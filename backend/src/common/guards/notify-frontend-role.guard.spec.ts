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
import { Tenant } from '../../api/admin/tenants/entities/tenant.entity'

// Helper to create mock tenant objects with required properties
function createMockTenant(id: string, externalId: string): Tenant {
  return {
    id,
    externalId,
    name: `Tenant ${externalId}`,
    slug: externalId,
    statusCode: null as any, // Not needed for these tests
    status: 'ACTIVE',
    createdAt: new Date(),
    createdBy: null,
    updatedAt: new Date(),
    updatedBy: null,
    isDeleted: false,
  }
}

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
      getUserTenants: vi.fn().mockResolvedValue([{ id: 'bc-health', name: 'BC Health' }]),
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
      const mockTenant = createMockTenant('tenant-uuid-123', 'bc-health')

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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('Client ID (azp) Validation (positive)', () => {
    it('should allow request with matching azp claim', async () => {
      const mockTenant = createMockTenant('tenant-uuid-456', 'bc-health')

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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('Issuer Validation (positive)', () => {
    it('should allow request with correct issuer', async () => {
      const mockTenant = createMockTenant('tenant-uuid-111', 'bc-health')

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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('x-tenant-id Header Validation (positive)', () => {
    it('should allow request with valid x-tenant-id header', async () => {
      const mockTenant = createMockTenant('tenant-uuid-444', 'bc-health')

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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
    })
  })

  describe('Tenant Existence (positive)', () => {
    it('should allow request when tenant exists', async () => {
      const mockTenant = createMockTenant('tenant-uuid-888', 'bc-health')

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
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue([{ id: 'bc-health' }])

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

      await expect(guard.canActivate(mockContext)).rejects.toThrow(BadRequestException)
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

      await expect(guard.canActivate(mockContext)).rejects.toThrow()
    })
  })

  describe('CSTAR Tenant Access (positive)', () => {
    it('should allow request when user has access to tenant in CSTAR', async () => {
      const mockTenant = createMockTenant('tenant-uuid-bbb', 'bc-health')

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
      const mockTenant = createMockTenant('tenant-uuid-ccc', 'bc-education')

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
        { id: 'bc-education' },
        { id: 'bc-other' },
        { id: 'bc-third' },
      ])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('CSTAR Tenant Access (negative)', () => {
    it('should reject request when user does not have access to tenant in CSTAR', async () => {
      const mockTenant = createMockTenant('tenant-uuid-ddd', 'bc-denied')

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
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue([
        { id: 'bc-other' },
        { id: 'bc-third' },
      ])

      await expect(guard.canActivate(mockContext)).rejects.toThrow()
    })

    it('should reject request when CSTAR returns empty tenant list', async () => {
      const mockTenant = createMockTenant('tenant-uuid-eee', 'bc-empty')

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

      await expect(guard.canActivate(mockContext)).rejects.toThrow()
    })

    it('should reject request when CSTAR API call fails', async () => {
      const mockTenant = createMockTenant('tenant-uuid-fff', 'bc-error')

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

      await expect(guard.canActivate(mockContext)).rejects.toThrow()
    })
  })

  describe('Role-Based Access Control (positive)', () => {
    it('should allow request with required NOTIFY_VIEWER role', async () => {
      const mockTenant = createMockTenant('tenant-uuid-ggg', 'bc-health')

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
      vi.spyOn(cstarApiClient, 'getUserTenants').mockResolvedValue([{ id: 'bc-health' }])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Role Decorator Handling', () => {
    it('should allow request when no @Roles() decorator is present', async () => {
      const mockTenant = createMockTenant('tenant-uuid-hhh', 'bc-health')

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

  describe('exact outcomes', () => {
    const mockTenant = createMockTenant('tenant-uuid-iii', 'bc-health')
    let request: any

    const contextFor = (requiredRoles: string[] | null, user: Record<string, unknown> = {}) => {
      request = {
        user: {
          azp: 'notify-client-123',
          iss: 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
          idir_user_guid: 'guid-iii',
          client_roles: [],
          ...user,
        },
        headers: { 'x-tenant-id': 'bc-health', authorization: 'Bearer token-iii' },
      }
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles)
      return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext
    }

    const expectRejection = async (
      promise: Promise<boolean>,
      type: new (...args: any[]) => Error,
      message: string,
    ) => {
      const error = await promise.catch((e: unknown) => e)
      expect(error).toBeInstanceOf(type)
      expect((error as Error).message).toBe(message)
    }

    beforeEach(() => {
      mockTenantsService.findByExternalId.mockResolvedValue(mockTenant)
      mockCstarApiClient.getUserTenants.mockResolvedValue(['bc-health'])
      mockCstarApiClient.getUserRoles.mockResolvedValue(['NOTIFY_VIEWER'])
    })

    it('attaches tenant, user GUID and client ID to the request on success', async () => {
      const result = await guard.canActivate(contextFor(['NOTIFY_VIEWER']))

      expect(result).toBe(true)
      expect(request.tenant).toBe(mockTenant)
      expect(request.userGuid).toBe('guid-iii')
      expect(request.clientId).toBe('notify-client-123')
      expect(mockCstarApiClient.getUserTenants).toHaveBeenCalledWith('guid-iii', 'Bearer token-iii')
      expect(mockCstarApiClient.getUserRoles).toHaveBeenCalledWith(
        'bc-health',
        'guid-iii',
        'Bearer token-iii',
      )
    })

    it('checks client ID before issuer and header', async () => {
      const context = contextFor(null, { azp: 'other', iss: 'other' })
      delete request.headers['x-tenant-id']

      await expectRejection(guard.canActivate(context), ForbiddenException, 'Invalid client ID')
    })

    it('checks issuer before header', async () => {
      const context = contextFor(null, { iss: 'other' })
      delete request.headers['x-tenant-id']

      await expectRejection(guard.canActivate(context), ForbiddenException, 'Invalid token issuer')
    })

    it('rejects a missing header without looking up the tenant', async () => {
      const context = contextFor(null)
      delete request.headers['x-tenant-id']

      await expectRejection(
        guard.canActivate(context),
        BadRequestException,
        'x-tenant-id header is required for frontend requests',
      )
      expect(mockTenantsService.findByExternalId).not.toHaveBeenCalled()
    })

    it.each([
      ['is not found', () => mockTenantsService.findByExternalId.mockResolvedValue(null)],
      [
        'lookup throws',
        () => mockTenantsService.findByExternalId.mockRejectedValue(new Error('db down')),
      ],
    ])('rejects with BadRequest when the tenant %s', async (_case, arrange) => {
      arrange()

      await expectRejection(
        guard.canActivate(contextFor(null)),
        BadRequestException,
        'Tenant with ID "bc-health" does not exist. Please verify the tenant ID and try again.',
      )
      expect(mockCstarApiClient.getUserTenants).not.toHaveBeenCalled()
    })

    it('rejects a user who is not a member of the tenant', async () => {
      mockCstarApiClient.getUserTenants.mockResolvedValue([{ id: 'other-tenant' }])

      await expectRejection(
        guard.canActivate(contextFor(null)),
        ForbiddenException,
        'User does not have access to this tenant',
      )
    })

    it('passes an UnauthorizedException from the tenant check through unchanged', async () => {
      mockCstarApiClient.getUserTenants.mockRejectedValue(
        new UnauthorizedException('CSTAR token expired'),
      )

      await expectRejection(
        guard.canActivate(contextFor(null)),
        UnauthorizedException,
        'CSTAR token expired',
      )
    })

    it('flattens any other tenant check failure to Unauthorized', async () => {
      mockCstarApiClient.getUserTenants.mockRejectedValue(new Error('CSTAR unavailable'))

      await expectRejection(
        guard.canActivate(contextFor(null)),
        UnauthorizedException,
        'Failed to verify tenant access',
      )
    })

    it('allows a user with the required SSO role without asking CSTAR for roles', async () => {
      const result = await guard.canActivate(
        contextFor(['NOTIFY_ADMIN'], { client_roles: ['NOTIFY_ADMIN'] }),
      )

      expect(result).toBe(true)
      expect(mockCstarApiClient.getUserRoles).not.toHaveBeenCalled()
    })

    it('rejects a user missing the required SSO role before checking CSTAR roles', async () => {
      await expectRejection(
        guard.canActivate(contextFor(['NOTIFY_ADMIN', 'NOTIFY_VIEWER'])),
        ForbiddenException,
        'User does not have required SSO role',
      )
      expect(mockCstarApiClient.getUserRoles).not.toHaveBeenCalled()
    })

    it('requires both the SSO and the CSTAR role when both kinds are listed', async () => {
      mockCstarApiClient.getUserRoles.mockResolvedValue([])

      await expectRejection(
        guard.canActivate(
          contextFor(['NOTIFY_ADMIN', 'NOTIFY_VIEWER'], { client_roles: ['NOTIFY_ADMIN'] }),
        ),
        ForbiddenException,
        'User does not have required CSTAR role',
      )
    })

    it('treats a missing client_roles claim as no SSO roles', async () => {
      await expectRejection(
        guard.canActivate(contextFor(['NOTIFY_ADMIN'], { client_roles: undefined })),
        ForbiddenException,
        'User does not have required SSO role',
      )
    })

    it.each([
      ['an Error', new Error('CSTAR unavailable')],
      ['an UnauthorizedException', new UnauthorizedException('CSTAR token expired')],
    ])('flattens %s from the CSTAR role lookup to Unauthorized', async (_case, failure) => {
      mockCstarApiClient.getUserRoles.mockRejectedValue(failure)

      await expectRejection(
        guard.canActivate(contextFor(['NOTIFY_VIEWER'])),
        UnauthorizedException,
        'Failed to verify user CSTAR role',
      )
    })
  })
})
