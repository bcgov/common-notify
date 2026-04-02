import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { jwtVerify, createRemoteJWKSet } from 'jose'

/**
 * JWT Guard for validating Bearer tokens from Keycloak's APS realm.
 *
 * This guard:
 * 1. Extracts the Bearer token from the Authorization header
 * 2. Validates the token signature using Keycloak's public JWKS endpoint
 * 3. Verifies the issuer matches the expected APS realm
 * 4. Attaches the decoded token to request.user for use in route handlers
 *
 * Used to protect admin routes that require authentication.
 */
@Injectable()
export class JwtGuard {
  private readonly logger = new Logger(JwtGuard.name)
  private readonly jwksUrl =
    'https://authz.apps.gov.bc.ca/auth/realms/aps/protocol/openid-connect/certs'
  private readonly expectedIssuer = 'https://authz.apps.gov.bc.ca/auth/realms/aps'
  private jwks: ReturnType<typeof createRemoteJWKSet>

  constructor() {
    this.jwks = createRemoteJWKSet(new URL(this.jwksUrl))
  }

  async canActivate(context: any): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const authHeader = request.headers.authorization
    this.logger.debug(
      `Authorization header: ${authHeader ? authHeader.substring(0, 50) + '...' : 'missing'}`,
    )

    const token = this.extractToken(request)
    if (!token) {
      this.logger.error('No Bearer token provided in Authorization header')
      throw new UnauthorizedException('Missing Authorization bearer token')
    }

    this.logger.debug(`Token received (first 50 chars): ${token.substring(0, 50)}...`)

    try {
      const verified = await jwtVerify(token, this.jwks, {
        issuer: this.expectedIssuer,
      })

      this.logger.debug(
        `JWT validated for subject: ${verified.payload.sub}, issuer: ${verified.payload.iss}`,
      )

      // Attach the decoded token to request for use in route handlers
      ;(request as any).user = verified.payload

      return true
    } catch (error) {
      this.logger.error(`JWT validation failed: ${error.message}`)
      throw new UnauthorizedException(`Invalid Bearer token: ${error.message}`)
    }
  }

  /**
   * Extract Bearer token from Authorization header
   */
  private extractToken(request: any): string | null {
    const authHeader = request.headers.authorization
    if (!authHeader) {
      return null
    }

    const [scheme, token] = authHeader.split(' ')
    if (scheme !== 'Bearer') {
      return null
    }

    return token
  }
}
