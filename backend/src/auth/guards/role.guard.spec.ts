import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { vi } from 'vitest'
import { RoleGuard } from './role.guard'

describe('RoleGuard', () => {
  let guard: RoleGuard

  const mockReflector = {
    getAllAndOverride: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile()

    guard = module.get<RoleGuard>(RoleGuard)
    vi.clearAllMocks()
  })

  describe('canActivate', () => {
    it('should return true when no roles are required', () => {
      mockReflector.getAllAndOverride.mockReturnValue(null)

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: 'user-123' },
          }),
        }),
      } as unknown as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
      expect(mockReflector.getAllAndOverride).toHaveBeenCalled()
    })

    it('should return true when required roles array is empty', () => {
      mockReflector.getAllAndOverride.mockReturnValue([])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: 'user-123' },
          }),
        }),
      } as unknown as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should throw ForbiddenException when user is not authenticated', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: null,
          }),
        }),
      } as unknown as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow('User not authenticated')
    })

    it('should throw ForbiddenException when user is undefined', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: undefined,
          }),
        }),
      } as unknown as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow('User not authenticated')
    })

    it('should return true when user has required realm role', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              realm_access: {
                roles: ['NOTIFY_ADMIN', 'user'],
              },
            },
          }),
        }),
      } as unknown as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should return true when user has required client role', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              client_roles: ['NOTIFY_ADMIN'],
            },
          }),
        }),
      } as unknown as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should return true when user has required role in both realm and client roles', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              realm_access: {
                roles: ['user'],
              },
              client_roles: ['NOTIFY_ADMIN'],
            },
          }),
        }),
      } as unknown as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should return true when user has one of multiple required roles (realm role)', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN', 'NOTIFY_USER'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              realm_access: {
                roles: ['NOTIFY_USER', 'user'],
              },
            },
          }),
        }),
      } as unknown as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should return true when user has one of multiple required roles (client role)', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN', 'NOTIFY_USER'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              client_roles: ['NOTIFY_ADMIN'],
            },
          }),
        }),
      } as unknown as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should throw ForbiddenException when user lacks required role', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              realm_access: {
                roles: ['user', 'NOTIFY_USER'],
              },
            },
          }),
        }),
      } as unknown as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow('Access denied')
    })

    it('should throw ForbiddenException when user has no roles at all', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
            },
          }),
        }),
      } as unknown as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow('Access denied')
    })

    it('should throw ForbiddenException when user has empty roles arrays', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              realm_access: {
                roles: [],
              },
              client_roles: [],
            },
          }),
        }),
      } as unknown as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockContext)).toThrow('Access denied')
    })

    it('should combine roles from realm_access and client_roles', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_USER'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              realm_access: {
                roles: ['user'],
              },
              client_roles: ['NOTIFY_USER'],
            },
          }),
        }),
      } as unknown as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should handle realm_access with no roles property', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['NOTIFY_ADMIN'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              realm_access: {},
              client_roles: ['NOTIFY_ADMIN'],
            },
          }),
        }),
      } as unknown as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should throw ForbiddenException with detailed message listing required and actual roles', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['ADMIN', 'SUPERUSER'])

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: 'user-123',
              realm_access: {
                roles: ['user', 'NOTIFY_USER'],
              },
            },
          }),
        }),
      } as unknown as ExecutionContext

      const error = (() => {
        try {
          guard.canActivate(mockContext)
        } catch (e) {
          return e
        }
      })()

      expect(error).toBeInstanceOf(ForbiddenException)
      expect(error.message).toContain('ADMIN')
      expect(error.message).toContain('SUPERUSER')
    })
  })
})
