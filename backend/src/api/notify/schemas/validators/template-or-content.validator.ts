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
 * templateId now lives inside each channel's `content`. Business rules:
 * - A channel's content must not mix a templateId with inline content (subject/body).
 * - The request must render from something: at least one channel provides either a
 *   content.templateId or inline content.
 */
@ValidatorConstraint({ name: 'isValidTemplateOrContent', async: false })
export class TemplateOrContentConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    const request = value as NotifySimpleRequest

    const channels = [request.email, request.sms, request.msgApp].filter(
      (channel): channel is NonNullable<typeof channel> => !!channel,
    )

    let hasSomethingToRender = false
    for (const channel of channels) {
      const content = channel.content
      const hasTemplateId = !!content?.templateId
      const hasInlineContent = !!(content && (content.subject || content.body))

      // Within a channel, a templateId and inline content are mutually exclusive
      if (hasTemplateId && hasInlineContent) {
        return false
      }

      if (hasTemplateId || hasInlineContent) {
        hasSomethingToRender = true
      }
    }

    return hasSomethingToRender
  }

  defaultMessage(): string {
    return 'Each channel must provide either content.templateId OR inline content (subject/body), but not both, and at least one channel must provide one'
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
