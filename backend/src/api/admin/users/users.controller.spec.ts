import { Test, TestingModule } from '@nestjs/testing'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { ConfigService } from '@nestjs/config'
import { AuthenticatedUserGuard } from '../../../common/guards/authenticated-user.guard'

describe('UsersController', () => {
  let controller: UsersController
  let usersService: { upsertUser: ReturnType<typeof vi.fn>; findAll: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    usersService = {
      upsertUser: vi.fn().mockResolvedValue({ user: {}, isNew: true, message: 'ok' }),
      findAll: vi
        .fn()
        .mockResolvedValue([{ id: 'uuid-1', externalId: 'ext-1', displayName: 'Ada Lovelace' }]),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      // AuthenticatedUserGuard needs ConfigService; it is not exercised in these unit tests.
      .overrideGuard(AuthenticatedUserGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: vi.fn() })
      .compile()

    controller = module.get<UsersController>(UsersController)
  })

  describe('upsertCurrentUser', () => {
    it('derives identity from verified JWT claims, not the request body', async () => {
      const req: any = {
        // A malicious body attempting to upsert a different identity.
        body: { id: 'victim-guid', email: 'victim@gov.bc.ca', displayName: 'Victim' },
        user: {
          idir_user_guid: 'attacker-guid',
          email: 'attacker@gov.bc.ca',
          display_name: 'Attacker',
          idir_username: 'attacker@idir',
          given_name: 'Att',
          family_name: 'Acker',
          sub: 'sub-123',
        },
      }

      await controller.upsertCurrentUser(req)

      expect(usersService.upsertUser).toHaveBeenCalledTimes(1)
      const [dto, createdBy] = usersService.upsertUser.mock.calls[0]
      expect(dto).toEqual({
        id: 'attacker-guid',
        email: 'attacker@gov.bc.ca',
        displayName: 'Attacker',
        username: 'attacker@idir',
        givenName: 'Att',
        familyName: 'Acker',
      })
      // Never the body-supplied victim identity.
      expect(dto.id).not.toBe('victim-guid')
      expect(createdBy).toBe('attacker@idir')
    })

    it('falls back to sub when idir_user_guid is absent', async () => {
      const req: any = { user: { sub: 'sub-only' } }
      await controller.upsertCurrentUser(req)
      const [dto, createdBy] = usersService.upsertUser.mock.calls[0]
      expect(dto.id).toBe('sub-only')
      expect(createdBy).toBe('sub-only')
    })
  })

  describe('getAllUsers', () => {
    it('returns only id, externalId and displayName (no contact details)', async () => {
      const result = await controller.getAllUsers()
      expect(result.count).toBe(1)
      expect(result.users[0]).toEqual({
        id: 'uuid-1',
        externalId: 'ext-1',
        displayName: 'Ada Lovelace',
      })
      expect(result.users[0]).not.toHaveProperty('email')
      expect(result.users[0]).not.toHaveProperty('username')
    })
  })
})
