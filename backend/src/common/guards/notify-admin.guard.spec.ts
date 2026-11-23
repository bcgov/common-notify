import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NotifyAdminGuard } from './notify-admin.guard'
import { CstarRole } from '../../enum/cstar-role.enum'
import { SsoRole } from '../../enum/sso-role.enum'

// Mock the Passport AuthGuard, so only the JWKS/signature layer is stubbed
vi.mock('@nestjs/passport', () => {
  return {
    AuthGuard: vi.fn((_strategy: string) => {
      return class {
        async canActivate(context: any) {
          // Return false if user is not authenticated
          const request = context.switchToHttp().getRequest()
          return !!request.user
        }
      }
    }),
  }
})

const CLIENT_ID = 'notify-app'
const ISSUER = 'https://keycloak.example/realms/standard'

const adminToken = {
  sub: 'admin-user',
  azp: CLIENT_ID,
  iss: ISSUER,
  client_roles: [SsoRole.NOTIFY_ADMIN] as unknown,
}

function createMockContext(user: unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, headers: {} }),
      getResponse: () => ({}),
    }),
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
  } as unknown as ExecutionContext
}

describe('NotifyAdminGuard', () => {
  let guard: NotifyAdminGuard
  let reflector: Reflector

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifyAdminGuard,
        Reflector,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => (key === 'auth.notifyClientId' ? CLIENT_ID : ISSUER),
          },
        },
      ],
    }).compile()

    guard = module.get<NotifyAdminGuard>(NotifyAdminGuard)
    reflector = module.get<Reflector>(Reflector)
    requireRoles([SsoRole.NOTIFY_ADMIN])
  })

  function requireRoles(roles: string[] | undefined) {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles)
  }

  describe('token', () => {
    it.each([null, undefined])(
      'rejects a request the JWT strategy did not accept (%s)',
      async (user) => {
        await expect(guard.canActivate(createMockContext(user))).resolves.toBe(false)
      },
    )

    it.each(['another-client', undefined])(
      'rejects NOTIFY_ADMIN on a token issued to another client (azp %s)',
      async (azp) => {
        const context = createMockContext({ ...adminToken, azp })
        await expect(guard.canActivate(context)).rejects.toThrow('Invalid client ID')
      },
    )

    it.each(['https://keycloak.example/realms/apigw', undefined])(
      'rejects NOTIFY_ADMIN on a token from another realm (iss %s)',
      async (iss) => {
        const context = createMockContext({ ...adminToken, iss })
        await expect(guard.canActivate(context)).rejects.toThrow('Invalid token issuer')
      },
    )
  })

  describe('role', () => {
    it.each([
      ['only the role', [SsoRole.NOTIFY_ADMIN]],
      ['the role among others', ['role1', SsoRole.NOTIFY_ADMIN, 'role3']],
    ])('allows a user with %s, without an x-tenant-id header', async (_name, client_roles) => {
      const context = createMockContext({ ...adminToken, client_roles })
      await expect(guard.canActivate(context)).resolves.toBe(true)
    })

    it.each([
      ['a different role', ['wrong-role']],
      ['no roles', []],
      ['null client_roles', null],
      ['no client_roles claim', undefined],
      ['client_roles that is a string containing the role', `NOT_${SsoRole.NOTIFY_ADMIN}`],
    ])('rejects a user with %s', async (_name, client_roles) => {
      const context = createMockContext({ ...adminToken, client_roles })
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
    })

    it('accepts only SSO roles, not a matching non-SSO role', async () => {
      requireRoles([SsoRole.NOTIFY_ADMIN, 'role1'])
      const context = createMockContext({ ...adminToken, client_roles: ['role1'] })
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
    })
  })

  it.each([
    ['no @Roles()', undefined],
    ['an empty @Roles()', []],
    ['only CSTAR roles', [CstarRole.NOTIFY_OPERATIONS_ADMIN]],
  ])('denies even an admin on a route with %s', async (_name, roles) => {
    requireRoles(roles)
    await expect(guard.canActivate(createMockContext(adminToken))).rejects.toThrow(
      ForbiddenException,
    )
  })
})
