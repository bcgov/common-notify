import { Injectable, UnauthorizedException, Logger, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
/**
 * Global Guard - Ensures all routes are explicitly guarded or marked public
 *
 * Purpose: Act as a guardrail to prevent accidental unprotected endpoints.
 * Does NOT validate JWT - that's the responsibility of specific guards
 * (TenantContextGuard, SSORoleGuard, TenantGuard, etc.)
 *
 * Allows request through if:
 * 1. Route is marked with @Public() decorator (explicitly no auth needed)
 * 2. Route has custom guards applied via @UseGuards() (let them handle auth)
 *
 * Rejects (401) if:
 * - Route has neither @Public() nor custom guards (unprotected endpoint)
 *
 * This ensures developers explicitly choose authentication/authorization
 * for every endpoint and prevents accidental unprotected routes.
 */
export class JwtGuard {
  protected readonly logger = new Logger(JwtGuard.name)

  constructor(protected readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    // Check if route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    // Check if route has custom guards applied via @UseGuards()
    const handler = context.getHandler()
    const controllerClass = context.getClass()

    const handlerMetadata =
      Reflect.getOwnMetadata('__guards__', handler) || Reflect.getOwnMetadata('guards', handler)
    const classMetadata =
      Reflect.getOwnMetadata('__guards__', controllerClass) ||
      Reflect.getOwnMetadata('guards', controllerClass)

    if (handlerMetadata || classMetadata) {
      return true // Let custom guards handle authentication/authorization
    }

    // Route is neither public nor guarded - reject
    this.logger.warn(
      `Unprotected route detected: ${controllerClass.name}.${handler.name}. Apply @Public() or @UseGuards()`,
    )
    throw new UnauthorizedException(
      'Route must be guarded with @UseGuards() or marked with @Public()',
    )
  }
}
