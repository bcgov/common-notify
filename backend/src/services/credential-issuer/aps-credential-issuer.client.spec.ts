import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { ConflictException, ServiceUnavailableException } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { ApsCredentialIssuerClient } from './aps-credential-issuer.client'

const APS_CONFIG = {
  baseUrl: 'https://aps.example/ds/api/v3',
  gatewayId: 'gw-fe8c5',
  environmentAppId: 'ENV123',
  tokenUrl: 'https://authz.example/token',
  clientId: 'notify-issuer',
  clientSecret: 'shhh',
  timeoutMs: 15000,
}

/** Builds an axios-shaped rejection so the client's error mapping can be exercised. */
function axiosError(status: number, data: unknown = {}) {
  const error: any = new Error(`Request failed with status code ${status}`)
  error.isAxiosError = true
  error.response = { status, data }
  return error
}

async function buildClient(config: Record<string, unknown>): Promise<ApsCredentialIssuerClient> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ApsCredentialIssuerClient,
      { provide: ConfigService, useValue: { get: vi.fn().mockReturnValue(config) } },
    ],
  }).compile()

  return module.get(ApsCredentialIssuerClient)
}

describe('ApsCredentialIssuerClient', () => {
  let client: ApsCredentialIssuerClient
  let request: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    client = await buildClient(APS_CONFIG)

    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'token-1', expires_in: 300 },
    } as any)

    request = vi.fn()
    ;(client as any).http.request = request
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isConfigured', () => {
    it('reports configured when every APS setting is present', () => {
      expect(client.isConfigured()).toBe(true)
    })

    it('reports unconfigured when the service account is missing', async () => {
      const unconfigured = await buildClient({ ...APS_CONFIG, clientSecret: undefined })
      expect(unconfigured.isConfigured()).toBe(false)
    })

    it('refuses to issue when unconfigured, naming the variables to set', async () => {
      const unconfigured = await buildClient({})

      await expect(unconfigured.issue({ applicationName: 'notify-a' })).rejects.toThrow(
        ServiceUnavailableException,
      )
    })
  })

  describe('issue', () => {
    it('posts to the gateway consumers endpoint and returns the credential', async () => {
      request.mockResolvedValue({
        data: { flow: 'kong-api-key-only', clientId: 'ENV123-APP456', apiKey: 'secret-key-value' },
      })

      const credential = await client.issue({
        applicationName: 'notify-tenant-a',
        applicationDescription: 'Tenant A',
        labels: { 'issued-by': 'notify' },
      })

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: '/gateways/gw-fe8c5/consumers',
          data: {
            environmentAppId: 'ENV123',
            application: { name: 'notify-tenant-a', description: 'Tenant A' },
            labels: { 'issued-by': 'notify' },
          },
          headers: { Authorization: 'Bearer token-1' },
        }),
      )
      expect(credential).toEqual({
        flow: 'kong-api-key-only',
        clientId: 'ENV123-APP456',
        apiKey: 'secret-key-value',
        clientSecret: undefined,
        issuer: undefined,
        tokenEndpoint: undefined,
      })
    })

    it('omits description and labels when they were not supplied', async () => {
      request.mockResolvedValue({
        data: { flow: 'kong-api-key-only', clientId: 'ENV123-APP456', apiKey: 'k' },
      })

      await client.issue({ applicationName: 'notify-tenant-a' })

      expect(request.mock.calls[0][0].data).toEqual({
        environmentAppId: 'ENV123',
        application: { name: 'notify-tenant-a' },
      })
    })

    it('surfaces a duplicate application as a conflict', async () => {
      request.mockRejectedValue(axiosError(409))

      await expect(client.issue({ applicationName: 'notify-tenant-a' })).rejects.toThrow(
        ConflictException,
      )
    })

    it('reports a rejected service account as unavailable rather than a client error', async () => {
      // 403 means the service account lost CredentialIssuer.Generate — an operator
      // problem, not something the calling tenant can fix.
      request.mockRejectedValue(axiosError(403))

      await expect(client.issue({ applicationName: 'notify-tenant-a' })).rejects.toThrow(
        /CredentialIssuer\.Generate scope/,
      )
    })

    it('passes APS\u2019s own explanation through on a 422, and names the likely cause', async () => {
      // The real message APS returns when APS_ENVIRONMENT_APP_ID is the product's appId
      // rather than an environment's. Replacing it with a generic "gateway unavailable"
      // turns a thirty-second fix into a hunt.
      request.mockRejectedValue(
        axiosError(422, {
          message: 'Environment not found for appId 986BA5DA8DA6 in gateway notify-test',
        }),
      )

      const error = await client.issue({ applicationName: 'notify-tenant-a' }).catch((e) => e)

      expect(error.message).toMatch(/Environment not found for appId 986BA5DA8DA6/)
      expect(error.message).toMatch(/environments\[\]\.appId/)
      // Not a "try again shortly" — retrying identical config will never succeed.
      expect(error.message).not.toMatch(/try again/i)
    })

    it('still gives a usable message when APS sends no explanation', async () => {
      request.mockRejectedValue(axiosError(422, {}))

      const error = await client.issue({ applicationName: 'notify-tenant-a' }).catch((e) => e)

      expect(error.message).toMatch(/APS_ENVIRONMENT_APP_ID/)
    })

    it('blames mismatched instances, not scopes, when the token itself is refused', async () => {
      // A 401 after a successful token fetch means the API does not trust the authority
      // that issued it — APS_TOKEN_URL and APS_API_BASE_URL are pointing at different
      // instances. Reporting that as a scope problem sends people to the wrong place.
      request.mockRejectedValue(axiosError(401))

      const error = await client.issue({ applicationName: 'notify-tenant-a' }).catch((e) => e)

      expect(error.message).toMatch(/different APS\s+instances/)
      expect(error.message).not.toMatch(/scope/)
    })

    it('refreshes the token and retries once on a 401', async () => {
      request.mockRejectedValueOnce(axiosError(401)).mockResolvedValueOnce({
        data: { flow: 'kong-api-key-only', clientId: 'ENV123-A', apiKey: 'k' },
      })

      const credential = await client.issue({ applicationName: 'notify-tenant-a' })

      expect(credential.clientId).toBe('ENV123-A')
      expect(request).toHaveBeenCalledTimes(2)
      expect(axios.post).toHaveBeenCalledTimes(2) // initial token, then the refresh
    })

    it('gives up after a second 401 instead of looping', async () => {
      request.mockRejectedValue(axiosError(401))

      await expect(client.issue({ applicationName: 'notify-tenant-a' })).rejects.toThrow(
        ServiceUnavailableException,
      )
      expect(request).toHaveBeenCalledTimes(2)
    })
  })

  describe('regenerate', () => {
    it('puts to the consumer with action=regenerate', async () => {
      request.mockResolvedValue({
        data: { flow: 'kong-api-key-only', clientId: 'ENV123-APP456', apiKey: 'rotated' },
      })

      const credential = await client.regenerate('ENV123-APP456')

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'put',
          url: '/gateways/gw-fe8c5/consumers/ENV123-APP456?action=regenerate',
        }),
      )
      expect(credential.apiKey).toBe('rotated')
    })
  })

  describe('token handling', () => {
    it('reuses a cached token across calls', async () => {
      request.mockResolvedValue({
        data: { flow: 'kong-api-key-only', clientId: 'ENV123-A', apiKey: 'k' },
      })

      await client.issue({ applicationName: 'one' })
      await client.issue({ applicationName: 'two' })

      expect(axios.post).toHaveBeenCalledTimes(1)
    })

    it('requests the configured scope only when one is set', async () => {
      const scoped = await buildClient({ ...APS_CONFIG, scope: 'CredentialIssuer.Generate' })
      ;(scoped as any).http.request = vi.fn().mockResolvedValue({
        data: { flow: 'kong-api-key-only', clientId: 'ENV123-A', apiKey: 'k' },
      })

      await scoped.issue({ applicationName: 'one' })

      expect(vi.mocked(axios.post).mock.calls[0][1]).toContain('scope=CredentialIssuer.Generate')
    })

    it('reports a token endpoint failure as unavailable', async () => {
      vi.mocked(axios.post).mockRejectedValue(axiosError(400, { error: 'invalid_client' }))

      await expect(client.issue({ applicationName: 'one' })).rejects.toThrow(
        ServiceUnavailableException,
      )
    })

    it('keeps the service-account diagnosis instead of a generic gateway error', async () => {
      // Regression: the token failure is already classified by getAccessToken, and the
      // request-level handler used to re-wrap it as "the gateway is not available",
      // burying the one message that says what is actually wrong.
      vi.mocked(axios.post).mockRejectedValue(axiosError(401, { error: 'invalid_client' }))

      await expect(client.issue({ applicationName: 'one' })).rejects.toThrow(
        /Check the APS service account credentials/,
      )
    })
  })
})
