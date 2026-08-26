import {
  Injectable,
  Logger,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import type {
  CredentialIssuer,
  IssueCredentialRequest,
  IssuedCredential,
} from './credential-issuer.interface'
import { describeApsInstanceMismatch, describeApsTarget } from './aps-instance'

/** Shape of POST/PUT /gateways/{gatewayId}/consumers responses (GatewayConsumerCredential). */
interface GatewayConsumerCredential {
  flow: string
  clientId?: string
  clientSecret?: string
  issuer?: string
  tokenEndpoint?: string
  apiKey?: string
  clientPublicKey?: string
  clientPrivateKey?: string
}

/**
 * APS Directory API — Credential Issuer client.
 *
 * Issues gateway consumer credentials without an Access Request or approval queue,
 * which is what lets Notify hand a tenant an API key from its own UI instead of
 * sending them to the API Services Portal.
 *
 * Endpoints (base path `/ds/api/v3`):
 *   POST /gateways/{gatewayId}/consumers                              -> 201 issue
 *   PUT  /gateways/{gatewayId}/consumers/{clientId}?action=regenerate -> 200 rotate
 *
 * Auth is OAuth2 client credentials against the APS authz realm, using a service
 * account that holds `CredentialIssuer.Generate` on the gateway. Tokens are cached
 * until shortly before expiry and refreshed once on a 401.
 */
@Injectable()
export class ApsCredentialIssuerClient implements CredentialIssuer {
  readonly name = 'aps-directory-api'

  private readonly logger = new Logger(ApsCredentialIssuerClient.name)
  private readonly http: AxiosInstance

  private readonly gatewayId: string
  private readonly environmentAppId: string
  private readonly tokenUrl: string
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly scope?: string

  private accessToken: string | null = null
  private tokenExpiresAt = 0

  constructor(private readonly configService: ConfigService) {
    const aps = this.configService.get('aps') ?? {}

    this.gatewayId = aps.gatewayId
    this.environmentAppId = aps.environmentAppId
    this.tokenUrl = aps.tokenUrl
    this.clientId = aps.clientId
    this.clientSecret = aps.clientSecret
    this.scope = aps.scope

    this.http = axios.create({
      baseURL: aps.baseUrl,
      timeout: aps.timeoutMs ?? 15000,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * A configuration problem worth reporting at startup, or null.
   *
   * Distinct from isConfigured(): everything can be present and still be wrong.
   */
  configurationWarning(): string | null {
    return describeApsInstanceMismatch(this.tokenUrl, this.http.defaults.baseURL)
  }

  /** What this issuer is pointed at, for the startup log. */
  describeTarget(): string {
    return describeApsTarget(this.http.defaults.baseURL, this.gatewayId)
  }

  isConfigured(): boolean {
    return Boolean(
      this.http.defaults.baseURL &&
      this.gatewayId &&
      this.environmentAppId &&
      this.tokenUrl &&
      this.clientId &&
      this.clientSecret,
    )
  }

  async issue(request: IssueCredentialRequest): Promise<IssuedCredential> {
    this.assertConfigured()

    // A new Application per credential is required, not a stylistic choice: APS
    // rejects a second issue request for the same Application in the same
    // Environment, so reusing one Application per tenant would break the second key.
    const body = {
      environmentAppId: this.environmentAppId,
      application: {
        name: request.applicationName,
        ...(request.applicationDescription ? { description: request.applicationDescription } : {}),
      },
      ...(request.labels ? { labels: request.labels } : {}),
    }

    const credential = await this.send<GatewayConsumerCredential>(
      'post',
      `/gateways/${encodeURIComponent(this.gatewayId)}/consumers`,
      body,
      `issue credential for application "${request.applicationName}"`,
    )

    return this.toIssuedCredential(credential)
  }

  async regenerate(clientId: string): Promise<IssuedCredential> {
    this.assertConfigured()

    const credential = await this.send<GatewayConsumerCredential>(
      'put',
      `/gateways/${encodeURIComponent(this.gatewayId)}/consumers/${encodeURIComponent(clientId)}?action=regenerate`,
      undefined,
      `regenerate credential ${clientId}`,
    )

    return this.toIssuedCredential(credential)
  }

  private toIssuedCredential(credential: GatewayConsumerCredential): IssuedCredential {
    if (!credential?.clientId) {
      this.logger.error(
        `APS returned a credential without a clientId (flow: ${credential?.flow ?? 'unknown'})`,
      )
      throw new InternalServerErrorException(
        'The API gateway returned an unexpected credential response',
      )
    }

    return {
      flow: credential.flow,
      clientId: credential.clientId,
      apiKey: credential.apiKey,
      clientSecret: credential.clientSecret,
      issuer: credential.issuer,
      tokenEndpoint: credential.tokenEndpoint,
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'API key issuing is not configured for this environment. ' +
          'Set APS_API_BASE_URL, APS_GATEWAY_ID, APS_ENVIRONMENT_APP_ID, APS_TOKEN_URL, ' +
          'APS_CLIENT_ID and APS_CLIENT_SECRET.',
      )
    }
  }

  /**
   * Fetch a service-account token, reusing the cached one until 80% of its TTL has
   * elapsed. The 20% margin keeps a token that is about to expire from being sent
   * on a slow request.
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken
    }

    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })
    if (this.scope) {
      form.set('scope', this.scope)
    }

    try {
      const response = await axios.post(this.tokenUrl, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      })

      this.accessToken = response.data.access_token
      const expiresIn = Number(response.data.expires_in) || 300
      this.tokenExpiresAt = Date.now() + expiresIn * 0.8 * 1000

      this.logger.debug('Obtained APS Directory API access token')
      return this.accessToken as string
    } catch (error) {
      const details = this.describeAxiosError(error)
      this.logger.error(`Failed to obtain APS Directory API access token: ${details}`)
      throw new ServiceUnavailableException(
        'Could not authenticate with the API gateway. Check the APS service account credentials.',
      )
    }
  }

  private async send<T>(
    method: 'post' | 'put',
    path: string,
    body: unknown,
    context: string,
  ): Promise<T> {
    try {
      return await this.request<T>(method, path, body)
    } catch (error) {
      if (this.statusOf(error) === 401) {
        // Token was rejected — most likely expired between the cache check and the
        // call. Drop it and retry once with a fresh one.
        this.logger.debug('APS Directory API returned 401; refreshing token and retrying once')
        this.accessToken = null
        try {
          return await this.request<T>(method, path, body)
        } catch (retryError) {
          throw this.toHttpException(retryError, context)
        }
      }
      throw this.toHttpException(error, context)
    }
  }

  private async request<T>(method: 'post' | 'put', path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken()
    const response = await this.http.request<T>({
      method,
      url: path,
      data: body,
      headers: { Authorization: `Bearer ${token}` },
    })
    return response.data
  }

  private statusOf(error: unknown): number | undefined {
    return axios.isAxiosError(error) ? error.response?.status : undefined
  }

  private toHttpException(error: unknown, context: string): Error {
    // getAccessToken already diagnosed its own failure — most usefully "check the
    // service account credentials", which is the difference between a five-minute fix
    // and an afternoon. Re-wrapping it here would replace that with a generic
    // "gateway unavailable", so anything already classified passes straight through.
    if (error instanceof HttpException) {
      return error
    }

    const status = this.statusOf(error)
    this.logger.error(`APS Directory API failed to ${context}: ${this.describeAxiosError(error)}`)

    // APS returns 409 when the same Application already has a credential in this
    // Environment. Surfacing it as a conflict tells the caller to retry with a
    // different name rather than implying the gateway is broken.
    if (status === 409) {
      return new ConflictException(
        'The API gateway already has a credential for this application and environment',
      )
    }

    // 401 and 403 mean different things and send you to different places, so they must
    // not share a message. A 401 here is *not* a scope problem: the token was fetched
    // successfully and then refused, which almost always means APS_TOKEN_URL and
    // APS_API_BASE_URL point at different APS instances — a token from one authority
    // presented to an API that does not trust it. Blaming scopes for that sends people
    // hunting through the Portal for a permission that was never missing.
    if (status === 401) {
      return new ServiceUnavailableException(
        'The API gateway would not accept the service account token. ' +
          'This usually means APS_TOKEN_URL and APS_API_BASE_URL point at different APS ' +
          'instances — check that both are the local mock, or both the same real instance.',
      )
    }

    if (status === 403) {
      return new ServiceUnavailableException(
        'The API gateway rejected the Notify service account. ' +
          'Confirm it still holds the CredentialIssuer.Generate scope on the gateway named ' +
          'by APS_GATEWAY_ID.',
      )
    }

    // 422 means APS understood and authorized the request and refused it on the data:
    // almost always APS_ENVIRONMENT_APP_ID naming something that is not an Environment
    // of this gateway. The overwhelmingly common cause is using the *product's* appId,
    // since GET /products returns an appId at both the product and environment level.
    if (status === 422) {
      return new InternalServerErrorException(
        `The API gateway rejected the credential request: ${this.apsMessage(error)} ` +
          'APS_ENVIRONMENT_APP_ID must be the appId of an *environment* — ' +
          '[].environments[].appId — not the product-level appId beside it.',
      )
    }

    if (status === 400 || status === 404) {
      return new InternalServerErrorException(
        `The API gateway rejected the credential request: ${this.apsMessage(error)} ` +
          'Check that APS_GATEWAY_ID and APS_ENVIRONMENT_APP_ID match a published product environment.',
      )
    }

    return new ServiceUnavailableException(
      'The API gateway is not available right now. Please try again shortly.',
    )
  }

  /**
   * APS's own explanation of a rejection, for passing through to the caller.
   *
   * Worth surfacing rather than replacing: on configuration errors APS says exactly what
   * is wrong ("Environment not found for appId X in gateway Y"), and burying that behind
   * a generic message turns a thirty-second fix into a hunt. These bodies carry
   * configuration detail, never credentials.
   */
  private apsMessage(error: unknown): string {
    if (!axios.isAxiosError(error)) return ''

    const data = error.response?.data as { message?: unknown } | undefined
    const message = typeof data?.message === 'string' ? data.message.trim() : ''
    if (!message) return ''

    return message.endsWith('.') ? message : `${message}.`
  }

  /** Compact, non-secret rendering of an axios failure for logs. */
  private describeAxiosError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 'no-status'
      const data = error.response?.data
      const body = typeof data === 'string' ? data : JSON.stringify(data ?? {})
      return `${status} ${error.message} ${body.slice(0, 500)}`
    }
    return error instanceof Error ? error.message : String(error)
  }
}
