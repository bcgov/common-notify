import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common'
import { Request } from 'express'
import { FeatureFlagService } from '../../api/feature-flag/feature-flag.service'

/**
 * Custom guard for SMS channel feature flag checks
 * Checks if SMS channel is requested in the payload and validates SMS_NOTIFICATIONS flag is enabled
 *
 * Used on endpoints that support multiple channels (email, SMS, etc.)
 * If the request body includes an `sms` field, verifies the SMS_NOTIFICATIONS feature flag is enabled
 * Otherwise, allows the request through without flag validation
 *
 * Example usage on a method:
 * ```
 * @Post()
 * @UseGuards(SmsChannelFeatureFlagGuard)
 * simpleSend(@Body() body: NotifySimpleRequest) { ... }
 * ```
 */
@Injectable()
export class SmsChannelFeatureFlagGuard implements CanActivate {
  private readonly logger = new Logger(SmsChannelFeatureFlagGuard.name)

  constructor(private readonly featureFlagService: FeatureFlagService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()

    // Get tenant from request context (set by AuthGuard)
    const tenant = (request as any).tenant
    if (!tenant) {
      this.logger.error('Tenant not found in request context')
      throw new ForbiddenException('Tenant context required')
    }

    // Check if the request body contains an SMS channel
    const body = request.body as any
    const hasSmsChannel = body?.sms !== undefined && body.sms !== null

    // If SMS channel is not requested, allow the request (e.g., email-only requests)
    if (!hasSmsChannel) {
      return true
    }

    // SMS channel requested - check if SMS_NOTIFICATIONS flag is enabled
    const flags = await this.featureFlagService.getFlagsForTenant(tenant.id)
    const smsEnabled = flags['sms_notifications'] ?? false

    if (!smsEnabled) {
      this.logger.warn(`SMS notifications disabled for tenant ${tenant.id}, rejecting SMS request`)
      throw new ForbiddenException('SMS notifications are not enabled for this tenant')
    }

    this.logger.debug(`SMS notifications enabled for tenant ${tenant.id}, allowing request`)
    return true
  }
}
