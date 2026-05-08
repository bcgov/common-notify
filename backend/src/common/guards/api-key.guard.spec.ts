import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ApiKeyGuard } from './api-key.guard'

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeyGuard],
    }).compile()

    guard = module.get<ApiKeyGuard>(ApiKeyGuard)
  })

  describe('canActivate', () => {
    it('should throw UnauthorizedException when Authorization header is missing', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
      expect(() => guard.canActivate(mockContext)).toThrow('API key is required')
    })

    it('should throw UnauthorizedException when Authorization header is null', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: null,
            },
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
      expect(() => guard.canActivate(mockContext)).toThrow('API key is required')
    })

    it('should throw UnauthorizedException when Authorization header is not a string', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 12345,
            },
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
      expect(() => guard.canActivate(mockContext)).toThrow('API key is required')
    })

    it('should throw UnauthorizedException when scheme is not ApiKey-v1', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer my-api-key',
            },
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
      expect(() => guard.canActivate(mockContext)).toThrow(
        'Invalid authorization scheme. Expected: Authorization: ApiKey-v1 {api-key}',
      )
    })

    it('should throw UnauthorizedException when scheme is apikey-v1 (wrong case)', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'apikey-v1 my-api-key',
            },
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
      expect(() => guard.canActivate(mockContext)).toThrow('Invalid authorization scheme')
    })

    it('should throw UnauthorizedException when API key is empty after scheme', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'ApiKey-v1 ',
            },
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
      expect(() => guard.canActivate(mockContext)).toThrow('API key cannot be empty')
    })

    it('should throw UnauthorizedException when API key is only whitespace', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'ApiKey-v1    ',
            },
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
      expect(() => guard.canActivate(mockContext)).toThrow('API key cannot be empty')
    })

    it('should return true when Authorization header has valid ApiKey-v1 scheme and key', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'ApiKey-v1 my-valid-api-key-12345',
            },
          }),
        }),
      } as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should return true with API key containing special characters', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'ApiKey-v1 key-with-dashes_and_underscores.and.dots',
            },
          }),
        }),
      } as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should return true with API key containing numbers and alphanumeric characters', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'ApiKey-v1 ABC123def456GHI789',
            },
          }),
        }),
      } as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should trim whitespace from API key', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'ApiKey-v1   my-api-key   ',
            },
          }),
        }),
      } as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should handle case-sensitive authorization header name (lowercase)', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'ApiKey-v1 my-api-key',
            },
          }),
        }),
      } as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })
  })
})
