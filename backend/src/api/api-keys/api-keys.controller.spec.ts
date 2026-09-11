import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { NotFoundException, UnauthorizedException } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Request } from 'express'
import { ApiKeysController } from './api-keys.controller'
import { ApiKeysService } from './api-keys.service'
import { FeatureFlagService } from '../feature-flag/feature-flag.service'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'

/**
 * Two onboarding paths share this route, and which one is live is decided by the
 * api_key_self_service flag:
 *
 *   flag ON  (PR/DEV/TEST) — keys come from the Notify UI; manual binding 404s.
 *   flag OFF (PROD)        — the gateway cannot issue keys, so manual binding is the path.
 *
 * The load-test self-bind sits outside that split: it must keep working in a PR
 * environment, where the flag is on.
 */
describe('ApiKeysController', () => {
  let controller: ApiKeysController
  let autoBind: ReturnType<typeof vi.fn>
  let bind: ReturnType<typeof vi.fn>
  let isEnabled: ReturnType<typeof vi.fn>
  let autobindEnabled: boolean
  let selfServiceEnabled: boolean

  beforeEach(async () => {
    autobindEnabled = false
    selfServiceEnabled = false
    autoBind = vi.fn().mockResolvedValue({ id: 'binding-uuid' })
    bind = vi.fn().mockResolvedValue({ id: 'binding-uuid' })
    isEnabled = vi.fn(async () => selfServiceEnabled)

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        {
          provide: ApiKeysService,
          useValue: { autoBindApiKeyForLoadTest: autoBind, bindApiKey: bind },
        },
        { provide: ConfigService, useValue: { get: vi.fn(() => autobindEnabled) } },
        { provide: FeatureFlagService, useValue: { isEnabled } },
      ],
    }).compile()

    controller = module.get(ApiKeysController)
  })

  const dto = { cstarTenantId: 'd290f1ee-6c54-4b01-90e6-d701748f0851' }

  const request = (headers: Record<string, string> = {}, idirUserGuid?: string) => {
    const req = { headers } as unknown as Request
    if (idirUserGuid) {
      ;(req as any).user = { idir_user_guid: idirUserGuid }
    }
    return req
  }

  const gatewayHeaders = {
    'x-credential-identifier': 'cred-1',
    'x-consumer-id': 'consumer-1',
    authorization: 'Bearer jwt',
  }

  describe('PROD path — self-service unavailable', () => {
    it('binds the credential to the tenant the user names', async () => {
      const result = await controller.bindApiKey(dto, request(gatewayHeaders, 'idir-guid'))

      expect(bind).toHaveBeenCalledWith({
        credentialIdentifier: 'cred-1',
        consumerId: 'consumer-1',
        cstarTenantId: dto.cstarTenantId,
        idirUserGuid: 'idir-guid',
        authHeader: 'Bearer jwt',
      })
      expect(result.message).toMatch(/successfully bound/i)
    })

    it('rejects a request that did not come through the gateway', async () => {
      await expect(controller.bindApiKey(dto, request({}, 'idir-guid'))).rejects.toThrow(
        UnauthorizedException,
      )
      expect(bind).not.toHaveBeenCalled()
    })

    it('rejects a JWT with no idir_user_guid claim', async () => {
      await expect(controller.bindApiKey(dto, request(gatewayHeaders))).rejects.toThrow(
        UnauthorizedException,
      )
      expect(bind).not.toHaveBeenCalled()
    })
  })

  describe('PR/DEV/TEST path — self-service available', () => {
    it('behaves as though the route does not exist', async () => {
      // Not merely refused: an environment must never advertise two ways to onboard.
      selfServiceEnabled = true

      await expect(
        controller.bindApiKey(dto, request(gatewayHeaders, 'idir-guid')),
      ).rejects.toThrow(NotFoundException)
      expect(bind).not.toHaveBeenCalled()
      expect(isEnabled).toHaveBeenCalledWith(FeatureFlagCode.API_KEY_SELF_SERVICE)
    })

    it('still self-binds for the load test, which has no user to authenticate as', async () => {
      // A PR environment has self-service on AND runs load tests, so this must not be
      // caught by the flag gate above.
      selfServiceEnabled = true
      autobindEnabled = true

      const result = await controller.bindApiKey(dto, request(gatewayHeaders))

      expect(autoBind).toHaveBeenCalledWith('cred-1', 'consumer-1')
      expect(bind).not.toHaveBeenCalled()
      expect(result.message).toMatch(/load-test tenant/)
    })
  })

  it('never lets the load-test path target a tenant the caller names', async () => {
    autobindEnabled = true

    await controller.bindApiKey(
      { cstarTenantId: 'a-real-tenant-guid' },
      request({ 'x-credential-identifier': 'cred-1' }),
    )

    // Bound to the fixed throwaway tenant; the body's tenant is never read.
    expect(autoBind).toHaveBeenCalledWith('cred-1', '')
    expect(bind).not.toHaveBeenCalled()
  })
})
