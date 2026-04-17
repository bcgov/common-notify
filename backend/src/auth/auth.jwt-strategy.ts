import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { passportJwtSecret } from 'jwks-rsa'

@Injectable()

/**
 * JWT Auth Strategy for Passport.  Uses the BC Ministry's OIDC well-known endpoints for a public cert to verify the JWT signature
 */
export class AuthJwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(AuthJwtStrategy.name)

  constructor(config: ConfigService) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: config.get<string>('auth.jwksUri'),
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: config.get<string>('auth.keycloakClientId'),
      issuer: config.get<string>('auth.jwtIssuer'),
      algorithms: ['RS256'],
    })
  }
  validate(payload: unknown): unknown {
    return payload
  }
}
