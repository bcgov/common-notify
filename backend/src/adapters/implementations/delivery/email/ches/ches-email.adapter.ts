import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
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

@Injectable()
export class ChesEmailTransport implements IEmailTransport {
  readonly name = 'ches'
  private readonly logger = new Logger(ChesEmailTransport.name)

  private tokenCache: { token: string; expiresAt: number } | null = null

  constructor(private readonly configService: ConfigService) {}

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const baseUrl = this.configService.get<string>('ches.baseUrl')
    const clientId = this.configService.get<string>('ches.clientId')
    const clientSecret = this.configService.get<string>('ches.clientSecret')
    const tokenUrl = this.configService.get<string>('ches.tokenUrl')

    if (!baseUrl || !clientId || !clientSecret || !tokenUrl) {
      throw new Error(
        'CHES configuration incomplete: CHES_BASE_URL, CHES_CLIENT_ID, CHES_CLIENT_SECRET, CHES_TOKEN_URL are required',
      )
    }

    const token = await this.getAccessToken(tokenUrl, clientId, clientSecret)
    const from =
      options.from ??
      this.configService.get<string>('ches.from') ??
      this.configService.get<string>('defaults.email.from', 'noreply@localhost')

    const payload: ChesEmailPayload = {
      from,
      to: [options.to],
      subject: options.subject,
      body: options.body,
      bodyType: 'html',
      attachments: this.mapAttachments(options.attachments),
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errText = await response.text()
      this.throwForChesApiFailure(response.status, errText, 'email')
    }

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
    const messageId = data.messages?.[0]?.msgId ?? data.txId

    return {
      messageId,
      providerResponse: data.txId,
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

    const response = await fetch(tokenUrl, {
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
    if (status === 429) {
      throw new BadRequestException(`${label} rate limit: ${message}`)
    }
    if (status >= 500) {
      throw new BadGatewayException(`${label}: upstream ${status} - ${message}`)
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
        contentType: 'application/octet-stream',
        encoding: 'base64' as const,
        filename: a.filename,
      }))
  }
}
