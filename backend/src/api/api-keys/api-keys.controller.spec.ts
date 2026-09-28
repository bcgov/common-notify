import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { NotFoundException, UnauthorizedException } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Request } from 'express'
import { ApiKeysController } from './api-keys.controller'
import { ApiKeysService } from './api-keys.service'

describe('ApiKeysController (load-test auto-bind)', () => {
  let controller: ApiKeysController
  let autoBind: ReturnType<typeof vi.fn>
  let autobindEnabled: boolean

  beforeEach(async () => {
    autobindEnabled = true
    autoBind = vi.fn().mockResolvedValue({ id: 'binding-uuid' })

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        { provide: ApiKeysService, useValue: { autoBindApiKeyForLoadTest: autoBind } },
        {
          provide: ConfigService,
          useValue: { get: vi.fn(() => autobindEnabled) },
        },
      ],
    }).compile()

    controller = module.get(ApiKeysController)
  })

  const request = (headers: Record<string, string> = {}) => ({ headers }) as unknown as Request

  it('binds the calling credential to the load-test tenant', async () => {
    const result = await controller.autoBindForLoadTest(
      request({ 'x-credential-identifier': 'cred-1', 'x-consumer-id': 'consumer-1' }),
    )

    expect(autoBind).toHaveBeenCalledWith('cred-1', 'consumer-1')
    expect(result.message).toMatch(/load-test tenant/)
  })

  it('behaves as though the route does not exist when auto-bind is off', async () => {
    // This is the only thing standing between a disabled environment and a binding
    // endpoint, so it must not merely refuse — it must not advertise itself either.
    autobindEnabled = false

    await expect(
      controller.autoBindForLoadTest(request({ 'x-credential-identifier': 'cred-1' })),
    ).rejects.toThrow(NotFoundException)
    expect(autoBind).not.toHaveBeenCalled()
  })

  it('rejects a request that did not come through the gateway', async () => {
    await expect(controller.autoBindForLoadTest(request())).rejects.toThrow(UnauthorizedException)
    expect(autoBind).not.toHaveBeenCalled()
  })

  it('ignores any tenant the caller names — there is no way to target a real tenant', async () => {
    // The old Postman flow took a cstarTenantId in the body. The load test still sends
    // one; nothing reads it, and the binding always goes to the throwaway tenant.
    const req = request({ 'x-credential-identifier': 'cred-1' })
    ;(req as any).body = { cstarTenantId: 'a-real-tenant-guid' }

    await controller.autoBindForLoadTest(req)

    expect(autoBind).toHaveBeenCalledWith('cred-1', '')
  })
})
