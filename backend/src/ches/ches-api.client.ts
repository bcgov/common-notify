import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ChesOAuthService } from './ches-oauth.service'
import { ChesMessageObject } from './schemas/ches-message-object'
import { ChesTransactionResponse } from './schemas/ches-transaction-response'
import { ChesMergeRequest } from './schemas/ches-merge-request'
import { ChesStatusObject } from './schemas/ches-status-object'

export { ChesMergeRequest, ChesStatusObject }

interface ChesErrorResponse {
  detail?: string
  message?: string
  errors?: Array<{ message: string }>
}

export interface ChesStatusQuery {
  msgId?: string
  status?: string
  tag?: string
  txId?: string
}

@Injectable()
export class ChesApiClient {
  private readonly logger = new Logger(ChesApiClient.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly chesOAuthService: ChesOAuthService,
  ) {}

  private getBaseUrl(): string {
    const url = this.configService.get<string>('ches.baseUrl')
    if (!url) {
      throw new Error('CHES_BASE_URL is required when using CHES passthrough mode')
    }
    return url.replace(/\/$/, '')
  }

  private async request<T>(
    method: string,
    path: string,
    bearerToken: string,
    body?: unknown,
  ): Promise<T> {
    const baseUrl = this.getBaseUrl()
    const url = `${baseUrl}${path}`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      const errBody = await response.text()
      let errData: ChesErrorResponse | null = null
      try {
        errData = JSON.parse(errBody) as ChesErrorResponse
      } catch {
        this.logger.debug(`CHES API returned non-JSON error body: ${errBody.slice(0, 100)}`)
      }

      const message =
        errData?.detail ??
        errData?.message ??
        errData?.errors?.[0]?.message ??
        errBody ??
        response.statusText

      if (response.status === 400) {
        throw new BadRequestException(message)
      }
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(message)
      }
      if (response.status === 404) {
        throw new NotFoundException(message)
      }
      if (response.status === 422) {
        throw new BadRequestException(`Validation error: ${message}`)
      }
      if (response.status === 429) {
        throw new BadRequestException(`CHES API rate limit exceeded: ${message}`)
      }

      this.logger.error(`CHES API error: ${response.status} ${message}`)
      throw new BadRequestException(`CHES API error: ${response.status} - ${message}`)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  private buildQuery(params: ChesStatusQuery): string {
    const qs = new URLSearchParams()
    for (const [key, val] of Object.entries(params) as [string, string | undefined][]) {
      if (val !== undefined) qs.append(key, val)
    }
    const s = qs.toString()
    return s ? `?${s}` : ''
  }

  async sendEmail(body: ChesMessageObject): Promise<ChesTransactionResponse> {
    const token = await this.chesOAuthService.getValidToken()
    return this.request<ChesTransactionResponse>('POST', '/email', token, body)
  }

  async sendEmailMerge(body: ChesMergeRequest): Promise<ChesTransactionResponse[]> {
    const token = await this.chesOAuthService.getValidToken()
    return this.request<ChesTransactionResponse[]>('POST', '/emailMerge', token, body)
  }

  async previewEmailMerge(body: ChesMergeRequest): Promise<ChesMessageObject[]> {
    const token = await this.chesOAuthService.getValidToken()
    return this.request<ChesMessageObject[]>('POST', '/emailMerge/preview', token, body)
  }

  async getStatusQuery(query: ChesStatusQuery): Promise<ChesStatusObject[]> {
    const token = await this.chesOAuthService.getValidToken()
    return this.request<ChesStatusObject[]>('GET', `/status${this.buildQuery(query)}`, token)
  }

  async getStatusMessage(msgId: string): Promise<ChesStatusObject> {
    const token = await this.chesOAuthService.getValidToken()
    return this.request<ChesStatusObject>('GET', `/status/${msgId}`, token)
  }

  async promoteQuery(query: ChesStatusQuery): Promise<void> {
    const token = await this.chesOAuthService.getValidToken()
    return this.request<void>('POST', `/promote${this.buildQuery(query)}`, token)
  }

  async promoteMessage(msgId: string): Promise<void> {
    const token = await this.chesOAuthService.getValidToken()
    return this.request<void>('POST', `/promote/${msgId}`, token)
  }

  async cancelQuery(query: ChesStatusQuery): Promise<void> {
    const token = await this.chesOAuthService.getValidToken()
    return this.request<void>('DELETE', `/cancel${this.buildQuery(query)}`, token)
  }

  async cancelMessage(msgId: string): Promise<void> {
    const token = await this.chesOAuthService.getValidToken()
    return this.request<void>('DELETE', `/cancel/${msgId}`, token)
  }
}
