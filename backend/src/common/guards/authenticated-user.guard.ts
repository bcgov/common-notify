import { Injectable, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'

/**
 * AuthenticatedUserGuard
 *
 * For frontend routes that need a signed-in Notify user but are NOT tenant-scoped and
 * are NOT admin-only — e.g. the login-time user upsert, which runs before any tenant is
 * selected.
 *
 * Validation flow:
 * 1. Verifies the JWT signature against Keycloak's JWKS and the issuer/audience
 *    (via the Passport 'jwt' strategy in the AuthGuard parent). This is a real
 *    cryptographic check — the backend does not trust the gateway alone.
 * 2. Confirms the token was issued to the Notify client (azp) and the frontend realm (iss).
 *
 * It intentionally does NOT require x-tenant-id or a CSTAR role (that is
 * {@link NotifyFrontendRoleGuard}), nor an SSO admin role (that is NotifyAdminGuard).
 * Use it for the narrowest "any authenticated Notify user" case only.
 */
@Injectable()
export class AuthenticatedUserGuard extends AuthGuard('jwt') {
  protected readonly logger = new Logger(AuthenticatedUserGuard.name)
  private readonly keycloakClientId: string
  private readonly keycloakIssuer: string

  constructor(configService: ConfigService) {
    super()
    this.keycloakClientId = configService.getOrThrow('auth.notifyClientId')
    this.keycloakIssuer = configService.getOrThrow('auth.frontendKeycloakIssuer')
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Validate JWT signature via the parent AuthGuard (Passport JWT strategy + JWKS).
    const jwtValidated = (await super.canActivate(context)) as boolean
    if (!jwtValidated) {
      return false
    }

    const request = context.switchToHttp().getRequest()
    const payload = request.user

    if (payload?.azp !== this.keycloakClientId) {
      this.logger.warn(
        `Client ID mismatch. Expected: ${this.keycloakClientId}, Got: ${payload?.azp}`,
      )
      throw new ForbiddenException('Invalid client ID')
    }

    if (payload?.iss !== this.keycloakIssuer) {
      this.logger.warn(`Issuer mismatch. Expected: ${this.keycloakIssuer}, Got: ${payload?.iss}`)
      throw new ForbiddenException('Invalid token issuer')
    }

    return true
  }
}
