import { Controller, Post, HttpCode, Req } from '@nestjs/common'
import { Request } from 'express'

/**
 * Root OAuth2 Token Endpoint Controller
 *
 * This controller lives at the application root level (not under /api prefix)
 * to handle Kong's OAuth2 plugin token requests at POST /oauth2/token
 */
@Controller()
export class RootOAuth2Controller {
  private readonly testCredentials = {
    'test-client-a': 'test-client-secret-a-12345678901234567890',
    'test-client-b': 'test-client-secret-b-98765432109876543210',
    'test-client-c': 'test-client-secret-c-11111111111111111111',
  }

  @Post('oauth2/token')
  @HttpCode(200)
  async getToken(@Req() request: Request): Promise<any> {
    // Parse form-urlencoded body
    const body = request.body as any
    const client_id = body.client_id
    const client_secret = body.client_secret
    const grant_type = body.grant_type
    const scope = body.scope

    // Validate required parameters
    if (!client_id || !client_secret) {
      return {
        error: 'invalid_request',
        error_description: 'Missing client_id or client_secret',
      }
    }

    if (grant_type !== 'client_credentials') {
      return {
        error: 'unsupported_grant_type',
        error_description: 'Only client_credentials grant_type is supported',
      }
    }

    // Validate credentials - this validates against our test consumers
    if (this.testCredentials[client_id] !== client_secret) {
      return {
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      }
    }

    // Generate a mock JWT token (simple base64, production use HS256/RS256)
    const payload = {
      iss: client_id,
      sub: client_id,
      aud: 'notify-api',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: scope || 'notify',
    }

    const token = Buffer.from(JSON.stringify(payload)).toString('base64')

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: scope || 'notify',
    }
  }
}
