import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'

/**
 * Guards the load-test auto-bind route (ApiKeysController). There is no user to authenticate:
 * the caller proves itself with an API key at the gateway, and the route exists only where
 * LOADTEST_AUTOBIND_ENABLED is on.
 *
 * Applied with @UseGuards rather than marking the route @Public(), so the global JwtGuard lets
 * it through for a stated reason and the conditions stay visible on the route.
 */
@Injectable()
export class LoadtestAutobindGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()

    // Behave as though the route does not exist anywhere it is not enabled, rather than
    // advertising a disabled endpoint to anyone probing for it.
    if (!this.configService.get<boolean>('loadtest.autobindEnabled')) {
      throw new NotFoundException('Cannot POST /api/v1/service/api-key/bind')
    }

    // Set by Kong's key-auth plugin. Absent means the request did not come through the
    // gateway with a valid key.
    if (!request.headers['x-credential-identifier']) {
      throw new UnauthorizedException(
        'Request must be made through the API gateway with a valid API key in the X-API-KEY header',
      )
    }

    return true
  }
}
