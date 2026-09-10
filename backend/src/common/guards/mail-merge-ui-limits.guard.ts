import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common'
import { MAIL_MERGE_UI_MAX_RECIPIENTS } from '../../api/notify/schemas/mail-merge.constants'

/**
 * Caps the size of a mail merge started from the Notify UI.
 *
 * The browser enforces the same cap before it uploads, but a caller can reach this route with a
 * user JWT and no browser at all - and unlike the service API, a UI send has no API key, so the
 * per-key volume limits never apply to it. Without this the only ceiling would be the service
 * API's 50,000.
 *
 * Runs as a guard rather than a DTO rule so the service route's own limit is untouched: both share
 * NotifyEmailChannel, and tightening the shared DTO would silently shrink the published API.
 *
 * Guards run before the ValidationPipe, so the body here is raw. Anything that is not a merge is
 * passed straight through for the pipe to reject or accept on its own terms.
 */
@Injectable()
export class MailMergeUiLimitsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const mergeArray = request?.body?.recipients?.mergeArray

    if (!Array.isArray(mergeArray)) {
      return true
    }

    // Row 0 is the header, so it does not count against the recipient cap.
    const recipientCount = Math.max(0, mergeArray.length - 1)

    if (recipientCount > MAIL_MERGE_UI_MAX_RECIPIENTS) {
      throw new UnprocessableEntityException({
        message: 'Request validation failed',
        errors: [
          `This list has ${recipientCount.toLocaleString()} recipients. The limit is ${MAIL_MERGE_UI_MAX_RECIPIENTS.toLocaleString()} per send.`,
        ],
      })
    }

    return true
  }
}
