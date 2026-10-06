import { ConfigService } from '@nestjs/config'
import { Logger } from '@nestjs/common'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CredentialIssuerModule } from './credential-issuer.module'
import { ApsCredentialIssuerClient } from './aps-credential-issuer.client'

const CONSISTENT_MOCK = {
  baseUrl: 'http://oauth2-mock:3002/ds/api/v3',
  tokenUrl: 'http://oauth2-mock:3002/',
  gatewayId: 'gw-local',
  environmentAppId: 'LOCAL001',
  clientId: 'sa-notify-service',
  clientSecret: 'secret',
}

/**
 * Exercises the module's own wiring rather than Nest's DI graph — ConfigModule is
 * registered globally in app.module.ts, so resolving it here would only be testing the
 * test harness.
 */
function boot(aps: Record<string, unknown>) {
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

  const client = new ApsCredentialIssuerClient({ get: () => aps } as unknown as ConfigService)
  new CredentialIssuerModule(client).onModuleInit()

  return {
    warnings: warn.mock.calls.flat().join(' '),
    logs: log.mock.calls.flat().join(' '),
  }
}

describe('CredentialIssuerModule startup reporting', () => {
  afterEach(() => vi.restoreAllMocks())

  it('warns when the token endpoint and Directory API are different instances', () => {
    // The exact shape of a half-switched .env: token URL back on the mock default while
    // the base URL still names a real instance. Fails later as a 401 that looks like a
    // permissions problem, so it is worth saying so at boot.
    const { warnings } = boot({
      ...CONSISTENT_MOCK,
      baseUrl: 'https://api-gov-bc-ca.test.api.gov.bc.ca/ds/api/v3',
    })

    expect(warnings).toMatch(/inconsistent/)
    expect(warnings).toMatch(/APS_TOKEN_URL/)
  })

  it('reports the issuer in use and says nothing else when configured consistently', () => {
    const { warnings, logs } = boot(CONSISTENT_MOCK)

    expect(warnings).not.toMatch(/inconsistent/)
    // Names the target, not the class — "where is this pointed?" must be answerable
    // from the startup line alone.
    expect(logs).toMatch(/local mock/)
    expect(logs).toMatch(/gw-local/)
  })

  it('names the missing variables when nothing is configured', () => {
    const { warnings } = boot({})

    expect(warnings).toMatch(/APS_CLIENT_SECRET/)
  })
})
