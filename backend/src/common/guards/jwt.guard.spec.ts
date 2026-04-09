import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtGuard } from './jwt.guard'

describe('JwtGuard', () => {
  let guard: JwtGuard

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtGuard],
    }).compile()

    guard = module.get<JwtGuard>(JwtGuard)
  })

  describe('canActivate', () => {
    it('should allow requests with valid Authorization header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer valid-token',
            },
          }),
        }),
      } as ExecutionContext

      const result = guard.canActivate(mockContext)

      expect(result).toBe(true)
    })

    it('should reject requests without Authorization header', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
    })

    it('should reject requests with invalid Authorization format', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'InvalidFormat token',
            },
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
    })

    it('should reject requests with empty Bearer token', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer ',
            },
          }),
        }),
      } as ExecutionContext

      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
    })

    it('should handle case-insensitive Authorization header', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              Authorization: 'Bearer valid-token',
            },
          }),
        }),
      } as ExecutionContext

      // The guard looks for lowercase 'authorization', so this should fail
      expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException)
    })
  })
})
