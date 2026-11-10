import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { BearerTokenGuard } from './bearer-token.guard'

describe('BearerTokenGuard', () => {
  const guard = new BearerTokenGuard()

  function contextWithAuthorization(authorization?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    } as unknown as ExecutionContext
  }

  it('allows a request with a Bearer token', () => {
    expect(guard.canActivate(contextWithAuthorization('Bearer abc.def.ghi'))).toBe(true)
  })

  it('rejects a request with no Authorization header', () => {
    expect(() => guard.canActivate(contextWithAuthorization())).toThrow(UnauthorizedException)
  })

  it('rejects a non-Bearer Authorization header', () => {
    expect(() => guard.canActivate(contextWithAuthorization('Basic dXNlcjpwYXNz'))).toThrow(
      UnauthorizedException,
    )
  })
})
