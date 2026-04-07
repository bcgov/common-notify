import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
/**
 * Guard that validates JWT tokens issued by Keycloak.
 * Apply to controllers or routes that require JWT authentication.
 * If the JWT is invalid or missing, an UnauthorizedException is thrown.
 */
export class AuthJwtGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(AuthJwtGuard.name)

  constructor(private readonly config: ConfigService) {
    super()
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      this.logger.error(
        `JWKS_URI ${this.config.get('auth.jwksUri')} JWT_ISSUER ${this.config.get('auth.jwtIssuer')} KEYCLOAK_CLIENT_ID ${this.config.get('auth.keycloakClientId')}`,
      )
      this.logger.error(`JWT is not valid. Err: ${err}. User: ${user}. Info: ${info}`)
      throw err || new UnauthorizedException()
    }
    return user
  }
}
