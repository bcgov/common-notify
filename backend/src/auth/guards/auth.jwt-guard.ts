import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
/**
 * Guard that validates JWT tokens issued by Keycloak.
 * Apply to controllers or routes that require JWT authentication.
 * If the JWT is invalid or missing, an UnauthorizedException is thrown.
 */
export class AuthJwtGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(AuthJwtGuard.name)

  handleRequest(err, user, info) {
    if (err || !user) {
      this.logger.error(
        `JWKS_URI ${process.env.JWKS_URI} JWT_ISSUER ${process.env.JWT_ISSUER} KEYCLOCK_CLIENT_ID ${process.env.KEYCLOCK_CLIENT_ID}`,
      )
      this.logger.error(`JWT is not valid. Err: ${err}. User: ${user}. Info: ${info}`)
      throw err || new UnauthorizedException()
    }
    return user
  }
}
