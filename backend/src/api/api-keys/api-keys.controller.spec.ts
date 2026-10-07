import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { VersioningType } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ApiKeysController } from './api-keys.controller'
import { ApiKeysService } from './api-keys.service'
import { JwtGuard } from '../../common/guards/auth.jwt-guard'

/**
 * Driven over HTTP with the global JwtGuard installed as app.ts installs it, because the guard
 * pipeline is what broke: a route with neither @UseGuards nor @Public is rejected before the
 * handler runs, which a direct call to the controller method never notices.
 */
describe('ApiKeysController (load-test auto-bind)', () => {
  let app: INestApplication
  let autoBind: ReturnType<typeof vi.fn>
  let autobindEnabled: boolean

  beforeEach(async () => {
    autobindEnabled = true
    autoBind = vi.fn().mockResolvedValue({ id: 'binding-uuid' })

    const module = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        { provide: ApiKeysService, useValue: { autoBindApiKeyForLoadTest: autoBind } },
        { provide: ConfigService, useValue: { get: vi.fn(() => autobindEnabled) } },
      ],
    }).compile()

    app = module.createNestApplication({ logger: false })
    app.useGlobalGuards(new JwtGuard(app.get(Reflector)))
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI, prefix: 'v' })
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  const bind = () => request(app.getHttpServer()).post('/api/v1/service/api-key/bind')

  it('binds the calling credential to the load-test tenant, past the global guard', async () => {
    const response = await bind()
      .set('x-credential-identifier', 'cred-1')
      .set('x-consumer-id', 'consumer-1')
      .expect(200)

    expect(response.body.message).toMatch(/load-test tenant/)
    expect(autoBind).toHaveBeenCalledWith('cred-1', 'consumer-1')
  })

  it('behaves as though the route does not exist when auto-bind is off', async () => {
    // This is the only thing standing between a disabled environment and a binding
    // endpoint, so it must not merely refuse — it must not advertise itself either.
    autobindEnabled = false

    await bind().set('x-credential-identifier', 'cred-1').expect(404)
    expect(autoBind).not.toHaveBeenCalled()
  })

  it('rejects a request that did not come through the gateway', async () => {
    const response = await bind().expect(401)

    expect(response.body.message).toMatch(/through the API gateway/)
    expect(autoBind).not.toHaveBeenCalled()
  })

  it('ignores any tenant the caller names — there is no way to target a real tenant', async () => {
    // The old Postman flow took a cstarTenantId in the body. The load test still sends
    // one; nothing reads it, and the binding always goes to the throwaway tenant.
    await bind()
      .set('x-credential-identifier', 'cred-1')
      .send({ cstarTenantId: 'a-real-tenant-guid' })
      .expect(200)

    expect(autoBind).toHaveBeenCalledWith('cred-1', '')
  })
})
