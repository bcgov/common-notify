import { ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
/**
 * An API guard that validates JWT tokens. If the JWT is invalid or missing, an UnauthorizedException is thrown.
 */
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name)

  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context)
  }
  handleRequest(err, user, info) {
    if (err || !user) {
      this.logger.error(
        ` JWKS_URI ${process.env.JWKS_URI} JWT_ISSUER ${process.env.JWT_ISSUER} KEYCLOCK_CLIENT_ID ${process.env.KEYCLOCK_CLIENT_ID}`,
      )
      this.logger.error(`JWT is not Valid.  Err: ${err}. - User ${user}. - Info. ${info}`)
      throw err || new UnauthorizedException()
    }
    return user
  }
}
