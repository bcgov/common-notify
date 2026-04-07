import { Controller, Post, BadRequestException, Body, HttpCode } from '@nestjs/common'

/**
 * OAuth2 Token Endpoint Controller
 *
 * This controller provides the POST /oauth2/token endpoint for local development.
 * Kong's OAuth2 plugin validates tokens but doesn't generate them, so we implement
 * a simple token endpoint here that matches the test credentials from kong-seed.sh
 */
@Controller('oauth2')
export class OAuth2Controller {
  // Test credentials from kong-seed.sh
  private readonly testCredentials = {
    'test-client-a': 'test-client-secret-a-12345678901234567890',
    'test-client-b': 'test-client-secret-b-98765432109876543210',
    'test-client-c': 'test-client-secret-c-11111111111111111111',
  }

  @Post('token')
  @HttpCode(200)
  async getToken(@Body() request: any): Promise<any> {
    const client_id = request.client_id
    const client_secret = request.client_secret
    const grant_type = request.grant_type
    const scope = request.scope

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

    // Validate credentials
    if (this.testCredentials[client_id] !== client_secret) {
      return {
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      }
    }

    // Generate a mock JWT token (in production, this would be properly signed)
    const payload = {
      iss: client_id,
      sub: client_id,
      aud: 'notify-api',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: scope || 'notify',
    }

    // Simple base64 encoding for demo (production would use HS256/RS256)
    const token = Buffer.from(JSON.stringify(payload)).toString('base64')

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: scope || 'notify',
    }
  }
}
