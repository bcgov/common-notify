import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { passportJwtSecret } from 'jwks-rsa'

@Injectable()

/**
 * JWT Auth Strategy for Passport.  Uses the BC Ministry's OIDC well-known endpoints for a public cert to verify the JWT signature
 *
 * Validates:
 * - JWT signature via JWKS (public key from Keycloak)
 * - Issuer is one of: FRONTEND_KEYCLOAK_ISSUER (standard realm) or API_GATEWAY_KEYCLOAK_ISSUER (apigw realm)
 * - Audience/Client ID matches NOTIFY_CLIENT_ID (if configured)
 *
 * Route-specific issuer validation is handled by guards:
 * - NotifyFrontendRoleGuard: Enforces FRONTEND_KEYCLOAK_ISSUER for user auth routes
 * - NotifyServiceGuard: Enforces API_GATEWAY_KEYCLOAK_ISSUER for service-to-service routes
 */
export class AuthJwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(AuthJwtStrategy.name)
  private readonly frontendIssuer: string
  private readonly apiGatewayIssuer: string

  constructor(config: ConfigService) {
    const notifyClientId = config.get<string>('auth.notifyClientId')
    const frontendIssuer = config.get<string>('auth.frontendKeycloakIssuer')
    const apiGatewayIssuer = config.get<string>('auth.apiGatewayKeycloakIssuer')

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: config.get<string>('auth.jwksUri'),
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Only validate audience if NOTIFY_CLIENT_ID is configured
      ...(notifyClientId ? { audience: notifyClientId } : {}),
      // Don't enforce a single issuer here - validate in validate() method
      // to allow both FRONTEND_KEYCLOAK_ISSUER and API_GATEWAY_KEYCLOAK_ISSUER
      algorithms: ['RS256'],
    })

    this.frontendIssuer = frontendIssuer
    this.apiGatewayIssuer = apiGatewayIssuer
  }

  validate(payload: any): any {
    // Validate issuer is one of the allowed realms
    const iss = payload.iss as string

    if (iss !== this.frontendIssuer && iss !== this.apiGatewayIssuer) {
      this.logger.warn(
        `Invalid token issuer: ${iss}. Expected one of: ${this.frontendIssuer}, ${this.apiGatewayIssuer}`,
      )
      throw new UnauthorizedException('Invalid token issuer')
    }

    return payload
  }
}
