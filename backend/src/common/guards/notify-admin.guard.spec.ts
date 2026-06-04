import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NotifyAdminGuard } from './notify-admin.guard'
import { SsoRole } from '../../enum/sso-role.enum'

describe('NotifyAdminGuard', () => {
  let guard: NotifyAdminGuard
  let reflector: Reflector

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotifyAdminGuard, Reflector],
    }).compile()

    guard = module.get<NotifyAdminGuard>(NotifyAdminGuard)
    reflector = module.get<Reflector>(Reflector)
  })

  describe('JWT Validation (positive)', () => {
    it('should allow request with valid JWT and no role requirement', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              client_roles: ['some-role'],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should allow admin user with required NOTIFY_ADMIN role', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'admin-user-123',
              client_roles: [SsoRole.NOTIFY_ADMIN],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should allow user with multiple roles including NOTIFY_ADMIN', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'multi-role-user',
              client_roles: ['role1', SsoRole.NOTIFY_ADMIN, 'role3'],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('JWT Validation (negative)', () => {
    it('should reject request with invalid JWT', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: null,
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(false)
    })

    it('should reject request with missing user payload', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(false)
    })
  })

  describe('Role Validation (positive)', () => {
    it('should allow user with exact required role', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              client_roles: [SsoRole.NOTIFY_ADMIN],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should allow user with one of multiple required roles', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-456',
              client_roles: ['role1', SsoRole.NOTIFY_ADMIN],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN, 'role1'])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Role Validation (negative)', () => {
    it('should reject user without required role', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-789',
              client_roles: ['wrong-role'],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(false)
    })

    it('should reject user with empty client_roles array', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-empty',
              client_roles: [],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(false)
    })

    it('should reject user with null client_roles', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-null',
              client_roles: null,
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(false)
    })

    it('should reject user with undefined client_roles', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-undefined',
              client_roles: undefined,
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(false)
    })

    it('should reject user with completely different role', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-different',
              client_roles: ['role-x', 'role-y', 'role-z'],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(false)
    })
  })

  describe('Decorator Handling', () => {
    it('should skip role validation when no @Roles() decorator is present', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-any',
              client_roles: ['any-role'],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null)

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should skip role validation when @Roles() decorator is empty array', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-empty-decorator',
              client_roles: [],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })

  describe('Guard Scope', () => {
    it('should only validate SSO roles, not CSTAR roles', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'sso-user',
              client_roles: [SsoRole.NOTIFY_ADMIN],
            },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should not require x-tenant-id header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-no-tenant',
              client_roles: [SsoRole.NOTIFY_ADMIN],
            },
            headers: {},
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])

      const result = await guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })
})
