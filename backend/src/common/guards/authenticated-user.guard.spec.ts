import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock the parent AuthGuard so the JWKS/Passport layer is stubbed: it authenticates iff
// request.user is present, mirroring the real 'jwt' strategy's behaviour.
vi.mock('@nestjs/passport', () => ({
  AuthGuard: vi.fn((_strategy: string) => {
    return class {
      async canActivate(context: any) {
        const request = context.switchToHttp().getRequest()
        if (!request.user) {
          throw new UnauthorizedException('Invalid or missing JWT')
        }
        return true
      }
    }
  }),
}))

// Imported after the mock is registered.
import { AuthenticatedUserGuard } from './authenticated-user.guard'

const CLIENT_ID = 'notify-app'
const ISSUER = 'https://keycloak.example/realms/standard'

function contextWith(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
}

describe('AuthenticatedUserGuard', () => {
  let guard: AuthenticatedUserGuard

  beforeEach(() => {
    const config = {
      getOrThrow: vi.fn((key: string) => (key === 'auth.notifyClientId' ? CLIENT_ID : ISSUER)),
    } as unknown as ConfigService
    guard = new AuthenticatedUserGuard(config)
  })

  it('allows a validly-signed token from the Notify client and frontend realm', async () => {
    const ctx = contextWith({ azp: CLIENT_ID, iss: ISSUER, sub: 'user-1' })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
  })

  it('rejects when the JWT is missing/invalid (parent guard fails)', async () => {
    await expect(guard.canActivate(contextWith(undefined))).rejects.toThrow(UnauthorizedException)
  })

  it('rejects a token issued to a different client (azp mismatch)', async () => {
    const ctx = contextWith({ azp: 'some-other-client', iss: ISSUER })
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException)
  })

  it('rejects a token from a different issuer', async () => {
    const ctx = contextWith({ azp: CLIENT_ID, iss: 'https://evil.example/realms/x' })
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException)
  })
})
