import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common'
import { Request } from 'express'
import { FeatureFlagService } from '../../api/feature-flag/feature-flag.service'

/** Flag that allows a caller to supply its own HTML rather than markdown. */
const HTML_BODY_TYPE_FLAG = 'html_body_type'

/**
 * Rejects `bodyType: "html"` unless the tenant holds the `html_body_type` flag.
 *
 * A markdown body is rendered by us with markdown-it configured `html: false`, so a template
 * author cannot inject markup and personalisation values cannot carry tags. `html` skips that
 * entirely and puts the caller's markup on the wire unchanged, so it is opt-in per tenant.
 *
 * Guards run before the validation pipe, so this sees the raw body. `bodyType` is only shape-
 * checked afterwards - anything that is not the string `html` falls through to `@IsEnum`, which
 * is what rejects a typo or a non-string.
 */
@Injectable()
export class HtmlBodyTypeFeatureFlagGuard implements CanActivate {
  private readonly logger = new Logger(HtmlBodyTypeFeatureFlagGuard.name)

  constructor(private readonly featureFlagService: FeatureFlagService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()

    const tenant = (request as any).tenant
    if (!tenant) {
      this.logger.error('Tenant not found in request context')
      throw new ForbiddenException('Tenant context required')
    }

    const channels = HtmlBodyTypeFeatureFlagGuard.channelsRequestingHtml(request.body)
    if (channels.length === 0) {
      return true
    }

    const enabled = await this.featureFlagService.isEnabled(HTML_BODY_TYPE_FLAG, tenant.id)
    if (!enabled) {
      this.logger.warn(
        `Rejected bodyType "html" on ${channels.join(', ')} for tenant ${tenant.id}: ` +
          `${HTML_BODY_TYPE_FLAG} is disabled`,
      )
      throw new ForbiddenException(
        'bodyType "html" is not enabled for this tenant. Send the body as markdown ' +
          '(bodyType: "markdown"), or ask an administrator to enable the html_body_type feature.',
      )
    }

    return true
  }

  /**
   * Channel names in this payload asking for an HTML body.
   *
   * Covers both request shapes: a single channel posted on its own (`{ recipients, content }`)
   * and the multi-channel envelope (`{ email, sms, msgApp }`). A merge send carries its content
   * in the same place, so it needs no separate case.
   */
  private static channelsRequestingHtml(body: unknown): string[] {
    if (!body || typeof body !== 'object') {
      return []
    }

    const payload = body as Record<string, any>
    const candidates: Array<[string, unknown]> = [
      ['content', payload.content],
      ['email', payload.email?.content],
      ['sms', payload.sms?.content],
      ['msgApp', payload.msgApp?.content],
    ]

    return candidates
      .filter(
        ([, content]) => (content as Record<string, unknown> | undefined)?.bodyType === 'html',
      )
      .map(([name]) => name)
  }
}
