import { Injectable, ExecutionContext } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'

/**
 * Guard for the api-key bind endpoint.
 *
 * Normally identical to AuthGuard('jwt') — a valid user JWT is required.
 *
 * When `loadtest.autobindEnabled` is true (LOADTEST_AUTOBIND_ENABLED=true, only ever
 * set in ephemeral PR dev environments for the duration of a load test), the JWT
 * requirement is skipped so the endpoint can self-bind the calling key to a throwaway
 * load-test tenant. Kong's key-auth still applies at the gateway, so the request is
 * still an authenticated API key — it simply lacks the user JWT.
 */
@Injectable()
export class JwtOrLoadtestBindGuard extends AuthGuard('jwt') {
  constructor(private readonly configService: ConfigService) {
    super()
  }

  canActivate(context: ExecutionContext) {
    if (this.configService.get<boolean>('loadtest.autobindEnabled')) {
      return true
    }
    return super.canActivate(context)
  }
}
