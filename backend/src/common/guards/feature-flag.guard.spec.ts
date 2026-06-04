import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { FeatureFlagGuard } from './feature-flag.guard'
import { FeatureFlagService } from '../../api/feature-flag/feature-flag.service'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { Tenant } from '../../api/admin/tenants/entities/tenant.entity'

describe('FeatureFlagGuard', () => {
  let guard: FeatureFlagGuard
  let reflector: Reflector
  let featureFlagService: FeatureFlagService
  let tenantsService: TenantsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagGuard,
        { provide: Reflector, useValue: { getAllAndOverride: vi.fn() } },
        { provide: FeatureFlagService, useValue: { isEnabled: vi.fn() } },
        { provide: TenantsService, useValue: { findByExternalId: vi.fn() } },
      ],
    }).compile()

    guard = module.get<FeatureFlagGuard>(FeatureFlagGuard)
    reflector = module.get<Reflector>(Reflector)
    featureFlagService = module.get<FeatureFlagService>(FeatureFlagService)
    tenantsService = module.get<TenantsService>(TenantsService)
  })

  describe('Feature Flag Decorator Presence (positive)', () => {
    it('should skip validation when no @FeatureFlag() decorator is present', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'tenant-123' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Tenant ID Extraction (positive)', () => {
    it('should extract tenant ID from x-tenant-id header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'tenant-123' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TEST_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('TEST_FEATURE', 'tenant-123')
    })

    it('should extract tenant ID from request.tenant set by AuthGuard', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            tenant: { id: 'tenant-456' },
            headers: {},
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TEST_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('TEST_FEATURE', 'tenant-456')
    })

    it('should extract tenant ID from query parameter', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            query: { tenantId: 'tenant-789' },
            headers: {},
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TEST_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should prioritize x-tenant-id header over query parameter', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'header-tenant' },
            query: { tenantId: 'query-tenant' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TEST_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('TEST_FEATURE', 'header-tenant')
    })
  })

  describe('Feature Flag Status Check (positive)', () => {
    it('should allow request when feature flag is enabled globally', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'tenant-123' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TEST_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should allow request when feature flag is enabled for specific tenant', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'tenant-456' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TENANT_SPECIFIC_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Feature Flag Status Check (negative)', () => {
    it('should reject request when feature flag is disabled', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'tenant-123' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('DISABLED_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(false)

      expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
    })

    it('should reject request when feature flag check returns false', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'tenant-789' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('ANOTHER_DISABLED_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(false)

      expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('Global Feature Flags (no tenant)', () => {
    it('should allow request without tenant for global feature flags', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('GLOBAL_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Tenant Resolution from External ID', () => {
    it('should resolve external tenant ID to internal UUID', async () => {
      const mockTenant = {
        id: 'internal-uuid',
        externalId: 'external-123',
        name: 'Test Tenant',
        slug: 'test-tenant',
        statusCode: { code: 'ACTIVE' },
        status: 'ACTIVE',
        createdAt: new Date(),
        createdBy: 'system',
        updatedAt: new Date(),
        updatedBy: 'system',
        isDeleted: false,
      } as unknown as Tenant

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'external-123' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TEST_FEATURE')
      vi.spyOn(tenantsService, 'findByExternalId').mockResolvedValue(mockTenant)
      vi.spyOn(featureFlagService, 'isEnabled').mockResolvedValue(true)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should handle tenant resolution failure gracefully', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'invalid-tenant' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('TEST_FEATURE')
      vi.spyOn(tenantsService, 'findByExternalId').mockRejectedValue(new Error('Lookup failed'))

      expect(guard.canActivate(mockContext)).rejects.toThrow()
    })
  })

  describe('Multiple Feature Flags', () => {
    it('should evaluate feature flag independently for each request', async () => {
      const mockContext1 = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'tenant-1' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      const mockContext2 = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-tenant-id': 'tenant-2' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue('INDEPENDENT_FEATURE')
      vi.spyOn(featureFlagService, 'isEnabled')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      const result1 = await guard.canActivate(mockContext1)
      expect(result1).toBe(true)

      expect(guard.canActivate(mockContext2)).rejects.toThrow(ForbiddenException)
    })
  })
})
