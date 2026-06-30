import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'
import { NotifySimpleRequest } from '../notify-simple-request'

/**
 * Validator constraint for template XOR content constraint
 *
 * Business rule: A notification request must have EITHER:
 * - A templateId (template will be resolved during processing), OR
 * - Inline content (subject/body for email, body for SMS)
 *
 * But NOT both.
 */
@ValidatorConstraint({ name: 'isValidTemplateOrContent', async: false })
export class TemplateOrContentConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    const request = value as NotifySimpleRequest

    // Request-wide templateId (applies to all channels that don't carry their own)
    const hasTopTemplateId = !!request.templateId

    // Check if content is provided in email channel
    const emailHasContent =
      request.email &&
      request.email.content &&
      (request.email.content.subject || request.email.content.body)

    // Check if content is provided in sms channel
    const smsHasContent = request.sms && request.sms.content && request.sms.content.body

    // Check if content is provided in msgApp channel
    const msgAppHasContent = request.msgApp && request.msgApp.content && request.msgApp.content.body

    const hasContent = emailHasContent || smsHasContent || msgAppHasContent

    // A channel may carry its own templateId; this satisfies the "render from something" requirement.
    // (Channel-level templateId vs inline content conflicts are caught per-channel by
    // ValidateChannelTemplateOrContent.)
    const hasChannelTemplateId =
      !!request.email?.templateId || !!request.sms?.templateId || !!request.msgApp?.templateId

    // A request-wide template and inline content are mutually exclusive (ambiguous combination)
    if (hasTopTemplateId && hasContent) {
      return false
    }

    // Must render from something: a request-wide template, a channel template, or inline content
    if (!hasTopTemplateId && !hasChannelTemplateId && !hasContent) {
      return false
    }

    return true
  }

  defaultMessage(): string {
    return 'Request must provide either templateId OR content (subject/body), but not both'
  }
}

/**
 * Custom decorator for template XOR content validation
 * Applied at the DTO class level
 *
 * Usage: @ValidateTemplateOrContent()
 */
export function ValidateTemplateOrContent(validationOptions?: ValidationOptions) {
  return function (target: object) {
    registerDecorator({
      target: target.constructor as any,
      propertyName: undefined as any,
      options: validationOptions,
      constraints: [],
      validator: TemplateOrContentConstraint,
    })
  }
}

/**
 * Static validator for testing and direct validation use cases
 * Maintains backward compatibility with existing tests
 */
export class TemplateOrContentValidator {
  static validate(request: NotifySimpleRequest): { valid: boolean; error?: string } {
    const constraint = new TemplateOrContentConstraint()
    const isValid = constraint.validate(request)

    if (!isValid) {
      return {
        valid: false,
        error: constraint.defaultMessage(),
      }
    }

    return { valid: true }
  }
}
