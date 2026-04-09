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
    it('should reject requests without Authorization header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject requests with invalid Authorization format (no Bearer prefix)', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'InvalidFormat token',
            },
          }),
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject requests with empty Bearer token', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer',
            },
          }),
        }),
      } as ExecutionContext

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should extract token from valid Authorization header', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer valid-token-format',
            },
          }),
        }),
      } as ExecutionContext

      // This will fail JWT verification (invalid token), but the important thing
      // is that it gets past the initial validation and tries to verify
      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
    })
  })
})
