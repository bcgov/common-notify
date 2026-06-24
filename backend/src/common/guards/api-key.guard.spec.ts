import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { describe, it, expect } from 'vitest'
import { ApiKeyGuard } from './api-key.guard'

function buildContext(authHeader?: string): ExecutionContext {
  const request: Record<string, unknown> = { headers: {} as Record<string, unknown> }
  if (authHeader !== undefined) {
    ;(request.headers as Record<string, unknown>)['authorization'] = authHeader
  }
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('ApiKeyGuard', () => {
  const guard = new ApiKeyGuard()

  it('throws when the Authorization header is missing', () => {
    expect(() => guard.canActivate(buildContext())).toThrow(UnauthorizedException)
  })

  it('throws when the scheme is not ApiKey-v1', () => {
    expect(() => guard.canActivate(buildContext('Bearer some-token'))).toThrow(UnauthorizedException)
  })

  it('throws when the key portion is empty', () => {
    expect(() => guard.canActivate(buildContext('ApiKey-v1 '))).toThrow(UnauthorizedException)
  })

  it('returns true and attaches gcNotifyAuthHeader when the header is valid', () => {
    const ctx = buildContext('ApiKey-v1 abc123')
    const result = guard.canActivate(ctx)
    expect(result).toBe(true)
    const req = ctx.switchToHttp().getRequest<{ gcNotifyAuthHeader?: string }>()
    expect(req.gcNotifyAuthHeader).toBe('ApiKey-v1 abc123')
  })
})
