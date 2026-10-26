import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'

/**
 * BearerTokenGuard
 *
 * Simple guard that checks for Bearer token in Authorization header.
 * Does NOT validate the JWT - just ensures the header exists.
 * Validation is delegated to the service/endpoint.
 *
 * Usage:
 * @UseGuards(BearerTokenGuard)
 * async endpoint() { }
 */
@Injectable()
export class BearerTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header')
    }

    return true
  }
}
