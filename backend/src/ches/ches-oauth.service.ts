import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

interface TokenCache {
  accessToken: string
  expiresAt: number
}

@Injectable()
export class ChesOAuthService {
  private readonly logger = new Logger(ChesOAuthService.name)
  private tokenCache: TokenCache | null = null
  private readonly tokenUrl: string
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly expiryBuffer = 60

  constructor(private readonly configService: ConfigService) {
    this.tokenUrl = this.configService.get<string>('ches.tokenUrl', '')
    this.clientId = this.configService.get<string>('ches.clientId', '')
    this.clientSecret = this.configService.get<string>('ches.clientSecret', '')
  }

  isConfigured(): boolean {
    return Boolean(this.tokenUrl && this.clientId && this.clientSecret)
  }

  async getValidToken(): Promise<string> {
    if (this.tokenCache && !this.isTokenExpired()) {
      return this.tokenCache.accessToken
    }
    return this.fetchNewToken()
  }

  private isTokenExpired(): boolean {
    if (!this.tokenCache) return true
    const now = Date.now()
    const bufferMs = this.expiryBuffer * 1000
    return now >= this.tokenCache.expiresAt - bufferMs
  }

  private async fetchNewToken(): Promise<string> {
    this.logger.debug('Fetching new CHES OAuth token')
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      this.logger.error(`CHES OAuth token fetch failed: ${response.status} - ${errorText}`)
      throw new Error(`Failed to fetch CHES OAuth token: ${response.status}`)
    }

    const data = (await response.json()) as {
      access_token: string
      expires_in: number
    }

    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }

    this.logger.debug(`CHES OAuth token cached, expires in ${data.expires_in}s`)
    return data.access_token
  }

  clearCache(): void {
    this.tokenCache = null
  }
}
