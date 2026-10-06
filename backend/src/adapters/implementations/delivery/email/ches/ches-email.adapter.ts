import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Redis from 'ioredis'
import { RedisCircuitBreaker } from '../../../../../common/redis/circuit-breaker'
import { RedisConcurrencyLimiter } from '../../../../../common/redis/concurrency-limiter'
import {
  TransientDeliveryError,
  isNotSentNetworkError,
  isTransientDeliveryError,
  isTransientHttpStatus,
} from '../../../../delivery-errors'
import { CHES_CIRCUIT_KEY, CHES_IN_FLIGHT_KEY } from '../../../../delivery-keys'
import { createRedisClient, type RedisConfig } from '../../../../../queue/redis-connection'
import { toEmailHtml } from '../../../../../services/rendering/email-body-html'
import { IEmailTransport, SendEmailOptions, SendEmailResult } from '../../../../interfaces'

interface ChesTokenResponse {
  access_token: string
  expires_in: number
  token_type?: string
}

interface ChesEmailPayload {
  from: string
  to: string[]
  subject: string
  body: string
  bodyType: 'html' | 'text'
  cc?: string[]
  bcc?: string[]
  attachments?: Array<{
    content: string
    contentType: string
    encoding: 'base64'
    filename: string
  }>
}

interface ChesEmailResponse {
  messages: Array<{ msgId: string; tag?: string; to: string[] }>
  txId: string
}

interface ChesErrorResponse {
  detail?: string
  message?: string
  errors?: Array<{ message: string }>
}

/**
 * Five failures in ten seconds is CHES unwell rather than one bad message: at its usual pace
 * that is most calls failing. Thirty seconds then covers a pod restart without probing it.
 */
const CHES_CIRCUIT = { failureThreshold: 5, windowMs: 10_000, cooldownMs: 30_000 }

/** How long startup waits for the limiter's Redis connection before sending without it. */
const LIMITER_CONNECT_WAIT_MS = 2000

@Injectable()
export class ChesEmailTransport implements IEmailTransport, OnModuleInit, OnModuleDestroy {
  readonly name = 'ches'
  private readonly logger = new Logger(ChesEmailTransport.name)

  private tokenCache: { token: string; expiresAt: number } | null = null
  private readonly redis: Redis | null = null
  /**
   * Caps how many emails this service is sending to CHES at once, counted across every pod
   * (CHES_MAX_CONCURRENT_REQUESTS). Each send waits here for a free slot before it calls CHES.
   * Null - no cap - when Redis is not configured (tests) or the limit is 0.
   */
  private readonly limiter: RedisConcurrencyLimiter | null = null
  /**
   * Stops every pod calling CHES while it is failing (TransientDeliveryError or a timeout):
   * sends wait instead of failing, and resume once a probe send succeeds. Null with the limiter.
   */
  private readonly breaker: RedisCircuitBreaker | null = null

  constructor(private readonly configService: ConfigService) {
    const redisConfig = this.configService.get<RedisConfig>('redis')
    const limit = this.configService.get<number>('ches.maxConcurrentRequests') ?? 0
    if (!redisConfig || !(limit > 0)) return

    this.redis = createRedisClient(redisConfig, ChesEmailTransport.name, {
      // On the send path: a Redis outage has to fall back to unlimited sending in milliseconds.
      // Not lazy: see onModuleInit.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 250,
    })
    const timeoutMs = this.configService.get<number>('ches.timeoutMs') ?? 120_000
    this.limiter = new RedisConcurrencyLimiter(this.redis, CHES_IN_FLIGHT_KEY, {
      limit,
      // Outlasts the request's own timeout, so a slot is only reclaimed from a pod that died.
      leaseMs: timeoutMs + 15_000,
    })
    this.breaker = new RedisCircuitBreaker(this.redis, CHES_CIRCUIT_KEY, {
      ...CHES_CIRCUIT,
      probeTimeoutMs: timeoutMs + 15_000,
      isFailure: (error) =>
        isTransientDeliveryError(error) || error instanceof GatewayTimeoutException,
    })
  }

  /**
   * Hold startup until the limiter's connection is up. With no offline queue a command sent
   * mid-handshake is rejected, so without this a pod's first sends would skip the limit. Never
   * fatal: after LIMITER_CONNECT_WAIT_MS the pod starts anyway and fails open until Redis is up.
   */
  async onModuleInit(): Promise<void> {
    const redis = this.redis
    if (!redis || redis.status === 'ready') return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, LIMITER_CONNECT_WAIT_MS)
      redis.once('ready', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => this.redis?.disconnect())
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    // Handle both flat (SendEmailOptions) and nested (NotifyEmailChannel) structures
    let to: string | string[]
    let subject: string
    let body: string
    let bodyType: 'text' | 'markdown' | 'html' | undefined
    let cc: string[] | undefined
    let bcc: string[] | undefined
    let attachments: SendEmailOptions['attachments'] | undefined

    const opts = options as any

    // Check if this is a nested NotifyEmailChannel structure
    // (recipients is an object with 'to' property, not an array)
    if (opts.recipients && typeof opts.recipients === 'object' && !Array.isArray(opts.recipients)) {
      // Nested structure: NotifyEmailChannel with recipients: { to: [...], cc?: [...], bcc?: [...] }
      to = opts.recipients.to || []
      cc = opts.recipients.cc
      bcc = opts.recipients.bcc
      subject = opts.content?.subject || ''
      body = opts.content?.body || ''
      bodyType = opts.content?.bodyType
      attachments = opts.attachments

      this.logger.debug(
        `[CHES] Received nested NotifyEmailChannel - to: ${JSON.stringify(to)}, subject: "${subject}", body length: ${body?.length || 0}`,
      )
    } else if (Array.isArray(opts.recipients)) {
      // Old flat structure: recipients is a string array
      to = opts.recipients
      subject = opts.subject
      body = opts.body
      bodyType = opts.bodyType
      attachments = opts.attachments

      this.logger.debug(
        `[CHES] Received old flat structure (recipients array) - to: ${JSON.stringify(to)}, subject: "${subject}", body length: ${body?.length || 0}`,
      )
    } else {
      // Flat structure: SendEmailOptions
      to = opts.to
      subject = opts.subject
      body = opts.body
      bodyType = opts.bodyType
      attachments = opts.attachments

      this.logger.debug(
        `[CHES] Received flat SendEmailOptions - to: ${JSON.stringify(to)}, subject: "${subject}", body length: ${body?.length || 0}`,
      )
    }

    const baseUrl = this.configService.get<string>('ches.baseUrl')
    const clientId = this.configService.get<string>('ches.clientId')
    const clientSecret = this.configService.get<string>('ches.clientSecret')
    const tokenUrl = this.configService.get<string>('ches.tokenUrl')

    if (!baseUrl || !clientId || !clientSecret || !tokenUrl) {
      throw new Error(
        'CHES configuration incomplete: CHES_BASE_URL, CHES_CLIENT_ID, CHES_CLIENT_SECRET, CHES_TOKEN_URL are required',
      )
    }

    // Validate required fields before attempting to send
    if (!to || (Array.isArray(to) && to.length === 0)) {
      throw new Error('CHES adapter: "to" recipients are required')
    }
    if (!subject || typeof subject !== 'string') {
      throw new Error('CHES adapter: "subject" is required and must be a string')
    }
    if (!body || typeof body !== 'string') {
      throw new Error('CHES adapter: "body" is required and must be a string')
    }

    const from =
      opts.from ??
      this.configService.get<string>('ches.from') ??
      this.configService.get<string>('defaults.email.from', 'noreply@localhost')

    // Convert body to HTML if markdown type
    let finalBody = body
    let chesBodyType: 'text' | 'html'

    if (bodyType === 'text') {
      chesBodyType = 'text'
    } else if (bodyType === 'html') {
      // The caller's own markup, gated by the html_body_type flag. Delivered unchanged.
      chesBodyType = 'html'
    } else {
      // Markdown, or omitted - markdown is the documented default for an inline body. Template
      // sends always arrive with a concrete bodyType, so an omitted one is never a template.
      // Shared with the preview endpoints so what is previewed is what is sent.
      finalBody = toEmailHtml(finalBody, 'markdown')
      chesBodyType = 'html'
    }

    const payload: ChesEmailPayload = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      body: finalBody,
      bodyType: chesBodyType,
      ...(cc && cc.length > 0 && { cc }),
      ...(bcc && bcc.length > 0 && { bcc }),
      attachments: this.mapAttachments(attachments),
    }

    this.logger.debug(
      `[CHES] Sending payload: ${JSON.stringify({
        from: payload.from,
        to: payload.to,
        subject: payload.subject.substring(0, 50),
        bodyType: payload.bodyType,
        bodyLength: payload.body.length,
        attachmentCount: payload.attachments?.length ?? 0,
      })}`,
    )

    const url = `${baseUrl.replace(/\/$/, '')}/email`
    const requestBody = JSON.stringify(payload)
    const post = async () =>
      this.fetchWithTimeout(url, 'email', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.getAccessToken(tokenUrl, clientId, clientSecret)}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      })
    // The token is taken inside the slot: one taken before a long wait for a slot can expire
    // before it is used. A 401 means CHES accepted nothing, so one retry with a fresh token
    // cannot send twice; it covers a token that expired in flight or was revoked.
    const send = async () => {
      let response = await post()
      if (response.status === 401) {
        await response.text().catch(() => undefined)
        this.logger.warn('[CHES] Token rejected; retrying once with a new token')
        this.tokenCache = null
        response = await post()
      }
      // Thrown here, inside the circuit breaker, so a 503 counts against CHES: fetch itself
      // resolves for any status.
      if (!response.ok) {
        const errText = await response.text()
        this.logger.error(`[CHES] Response not OK: ${response.status} - ${errText}`)
        this.throwForChesApiFailure(response.status, errText, 'email')
      }
      return response
    }
    // Waiting for a closed circuit and then a slot sits outside the timeout: that measures CHES,
    // not our own queue. The circuit is checked first, so an open one holds no slots.
    const limited = () => (this.limiter ? this.limiter.run(send) : send())
    const response = this.breaker ? await this.breaker.run(limited) : await limited()

    let data: ChesEmailResponse
    try {
      data = (await response.json()) as ChesEmailResponse
    } catch (caught: unknown) {
      const errMeta =
        caught instanceof Error
          ? { name: caught.name, message: caught.message }
          : { message: String(caught) }
      this.logger.error(errMeta, 'CHES email: success response was not valid JSON')
      throw new BadGatewayException('CHES email returned a non-JSON response body')
    }

    this.logger.debug(`[CHES] Response received: ${JSON.stringify(data)}`)

    const messageId = data.messages?.[0]?.msgId ?? data.txId

    return {
      messageId,
      providerResponse: data.txId,
    }
  }

  /**
   * fetch with a deadline. An email timeout becomes a 504 naming CHES: the outcome is unknown -
   * CHES may have queued it - so it is not retried as transient. A token timeout, or a network
   * error before the request reached CHES, sent nothing, so it is transient.
   */
  private async fetchWithTimeout(
    url: string,
    operation: 'email' | 'token',
    init: RequestInit,
  ): Promise<Response> {
    const timeoutMs = this.configService.get<number>('ches.timeoutMs') ?? 120_000
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (caught: unknown) {
      if (
        caught instanceof Error &&
        (caught.name === 'TimeoutError' || caught.name === 'AbortError')
      ) {
        this.logger.error(`[CHES] ${operation} request timed out after ${timeoutMs}ms`)
        const message = `CHES ${operation} request timed out after ${timeoutMs / 1000}s`
        if (operation === 'token') throw new TransientDeliveryError(message, 504)
        throw new GatewayTimeoutException(message)
      }
      if (isNotSentNetworkError(caught)) {
        const code = (caught as { cause: { code: string } }).cause.code
        throw new TransientDeliveryError(`CHES ${operation} unreachable: ${code}`)
      }
      throw caught
    }
  }

  private async getAccessToken(
    tokenUrl: string,
    clientId: string,
    clientSecret: string,
  ): Promise<string> {
    const now = Date.now()
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.token
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    })

    const response = await this.fetchWithTimeout(tokenUrl, 'token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!response.ok) {
      const errText = await response.text()
      this.throwForChesApiFailure(response.status, errText, 'token')
    }

    let data: ChesTokenResponse
    try {
      data = (await response.json()) as ChesTokenResponse
    } catch (caught: unknown) {
      const errMeta =
        caught instanceof Error
          ? { name: caught.name, message: caught.message }
          : { message: String(caught) }
      this.logger.error(errMeta, 'CHES token: success response was not valid JSON')
      throw new BadGatewayException('CHES token endpoint returned a non-JSON response body')
    }
    const expiresIn = data.expires_in ?? 300
    this.tokenCache = {
      token: data.access_token,
      expiresAt: now + expiresIn * 1000,
    }

    return data.access_token
  }

  /** Map CHES HTTP errors to Nest exceptions so callers see the upstream message (not a generic 500). */
  private throwForChesApiFailure(status: number, errBody: string, kind: 'email' | 'token'): never {
    let errData: ChesErrorResponse | null = null
    try {
      errData = JSON.parse(errBody) as ChesErrorResponse
    } catch {
      this.logger.debug(`CHES ${kind} non-JSON error body: ${errBody.slice(0, 200)}`)
    }

    const message =
      errData?.detail ??
      errData?.message ??
      errData?.errors?.[0]?.message ??
      errBody ??
      String(status)

    const label = kind === 'token' ? 'CHES token' : 'CHES email'
    this.logger.error(
      { status, kind, chesError: errBody.slice(0, 2000) },
      `${label} request failed`,
    )

    // CHES down, restarting, overloaded or rate limiting: it accepted nothing, so send it later.
    if (isTransientHttpStatus(status)) {
      throw new TransientDeliveryError(
        `${label}: upstream ${status} - ${message}`,
        status >= 500 ? 502 : status,
      )
    }
    if (status === 400) {
      throw new BadRequestException(`${label}: ${message}`)
    }
    if (status === 401 || status === 403) {
      throw new UnauthorizedException(`${label}: ${message}`)
    }
    if (status === 404) {
      throw new NotFoundException(`${label}: ${message}`)
    }
    if (status === 422) {
      throw new BadRequestException(`${label} validation: ${message}`)
    }

    throw new BadGatewayException(`${label}: ${status} - ${message}`)
  }

  private mapAttachments(
    attachments?: SendEmailOptions['attachments'],
  ): ChesEmailPayload['attachments'] {
    if (!attachments?.length) return undefined

    return attachments
      .filter((a) => a.sendingMethod === 'attach')
      .map((a) => ({
        content:
          typeof a.content === 'string'
            ? Buffer.from(a.content, 'utf-8').toString('base64')
            : a.content.toString('base64'),
        contentType: a.contentType || 'application/octet-stream',
        encoding: 'base64' as const,
        filename: a.filename,
      }))
  }
}
