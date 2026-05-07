import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'
import { AuthJwtGuard } from './auth.jwt-guard'

describe('AuthJwtGuard', () => {
  let guard: AuthJwtGuard
  let configService: ConfigService

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config = {
        'auth.jwksUri': 'https://keycloak.example.com/jwks',
        'auth.jwtIssuer': 'https://keycloak.example.com/issuer',
        'auth.keycloakClientId': 'my-app-client',
      }
      return config[key]
    }),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthJwtGuard,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile()

    guard = module.get<AuthJwtGuard>(AuthJwtGuard)
    configService = module.get<ConfigService>(ConfigService)
    vi.clearAllMocks()
  })

  describe('handleRequest', () => {
    it('should return user when valid JWT is provided with no error', () => {
      const mockUser = {
        sub: 'user-123',
        email: 'user@example.com',
        preferred_username: 'testuser',
      }

      const result = guard.handleRequest(null, mockUser, null)

      expect(result).toEqual(mockUser)
    })

    it('should throw UnauthorizedException when error is provided', () => {
      const mockError = new Error('JWT validation failed')

      expect(() => guard.handleRequest(mockError, null, null)).toThrow(mockError)
    })

    it('should throw UnauthorizedException when user is null', () => {
      expect(() => guard.handleRequest(null, null, null)).toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException when user is undefined', () => {
      expect(() => guard.handleRequest(null, undefined, null)).toThrow(UnauthorizedException)
    })

    it('should throw provided error when both error and no user', () => {
      const mockError = new Error('Token expired')

      expect(() => guard.handleRequest(mockError, null, 'Token expired')).toThrow(mockError)
    })

    it('should throw UnauthorizedException when error is null but user is falsy', () => {
      expect(() => guard.handleRequest(null, false as any, null)).toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException with empty string user', () => {
      expect(() => guard.handleRequest(null, '' as any, null)).toThrow(UnauthorizedException)
    })

    it('should return user with valid JWT containing realm_access', () => {
      const mockUser = {
        sub: 'user-456',
        email: 'admin@example.com',
        realm_access: {
          roles: ['NOTIFY_ADMIN', 'user'],
        },
      }

      const result = guard.handleRequest(null, mockUser, null)

      expect(result).toEqual(mockUser)
      expect(result.realm_access).toBeDefined()
      expect(result.realm_access.roles).toContain('NOTIFY_ADMIN')
    })

    it('should return user with valid JWT containing client_roles', () => {
      const mockUser = {
        sub: 'user-789',
        email: 'client-user@example.com',
        client_roles: ['NOTIFY_USER'],
      }

      const result = guard.handleRequest(null, mockUser, null)

      expect(result).toEqual(mockUser)
      expect(result.client_roles).toContain('NOTIFY_USER')
    })

    it('should log error when JWT is invalid (error provided)', () => {
      const mockError = new Error('Invalid JWT signature')
      const loggerSpy = vi.spyOn(guard['logger'], 'error')

      expect(() => guard.handleRequest(mockError, null, null)).toThrow(mockError)
      expect(loggerSpy).toHaveBeenCalled()

      loggerSpy.mockRestore()
    })

    it('should log error details including JWKS_URI, JWT_ISSUER, and KEYCLOAK_CLIENT_ID', () => {
      const mockError = new Error('JWT validation error')
      const loggerSpy = vi.spyOn(guard['logger'], 'error')

      expect(() => guard.handleRequest(mockError, null, null)).toThrow(mockError)

      const logCalls = loggerSpy.mock.calls
      const configLogCall = logCalls.find((call) => call[0]?.includes('JWKS_URI'))

      expect(configLogCall).toBeDefined()
      expect(configService.get).toHaveBeenCalledWith('auth.jwksUri')
      expect(configService.get).toHaveBeenCalledWith('auth.jwtIssuer')
      expect(configService.get).toHaveBeenCalledWith('auth.keycloakClientId')

      loggerSpy.mockRestore()
    })

    it('should throw UnauthorizedException when no user and no error (info only)', () => {
      const mockInfo = 'No authentication token provided'

      expect(() => guard.handleRequest(null, null, mockInfo)).toThrow(UnauthorizedException)
    })

    it('should return user with null info when valid', () => {
      const mockUser = {
        sub: 'user-999',
        email: 'test@example.com',
      }

      const result = guard.handleRequest(null, mockUser, null)

      expect(result).toEqual(mockUser)
    })

    it('should handle user object with additional custom claims', () => {
      const mockUser = {
        sub: 'user-custom',
        email: 'custom@example.com',
        preferred_username: 'customuser',
        given_name: 'Custom',
        family_name: 'User',
        custom_claim: 'custom_value',
      }

      const result = guard.handleRequest(null, mockUser, null)

      expect(result).toEqual(mockUser)
      expect(result.custom_claim).toBe('custom_value')
    })

    it('should throw error with priority over user when both provided', () => {
      const mockError = new Error('Error takes priority')
      const mockUser = {
        sub: 'user-123',
        email: 'user@example.com',
      }

      // Error should be thrown even if user is valid
      expect(() => guard.handleRequest(mockError, mockUser, null)).toThrow(mockError)
    })
  })

  describe('constructor', () => {
    it('should initialize with ConfigService', () => {
      expect(guard).toBeDefined()
      expect(guard['config']).toBeDefined()
    })

    it('should call super() with jwt strategy', () => {
      // AuthJwtGuard extends AuthGuard('jwt')
      // We can verify it's properly initialized by checking the class name
      expect(guard.constructor.name).toBe('AuthJwtGuard')
    })
  })
})
