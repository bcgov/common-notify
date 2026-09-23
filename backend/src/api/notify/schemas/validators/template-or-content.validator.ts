import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'
import { NotifySimpleRequest } from '../notify-simple-request'

/**
 * The request must render from something: at least one channel has to provide either a
 * content.templateId or inline content. A channel carrying neither is fine on its own - only a
 * request where no channel renders anything is rejected.
 *
 * Whether a templateId may sit beside inline content is a per-channel question, answered by
 * TemplateOrRendererConstraint on the channel classes. It lives there because that one also runs
 * for the /notifysimple/{email,sms} shorthands, which post a bare channel and never reach this
 * request-level rule.
 */
@ValidatorConstraint({ name: 'isValidTemplateOrContent', async: false })
export class TemplateOrContentConstraint implements ValidatorConstraintInterface {
  // Registered at class level, where class-validator passes the instance on `args.object` and
  // leaves `value` undefined. The fallback keeps a directly-passed object working.
  validate(value: any, args?: ValidationArguments): boolean {
    const request = (args?.object ?? value) as NotifySimpleRequest

    const channels = [request.email, request.sms, request.msgApp].filter(
      (channel): channel is NonNullable<typeof channel> => !!channel,
    )

    let hasSomethingToRender = false
    for (const channel of channels) {
      const content = channel.content
      const hasTemplateId = !!content?.templateId
      // `subject` is email and message-app content only - NotifySmsContent has no such field.
      const hasInlineContent = !!(
        content &&
        (('subject' in content && content.subject) || content.body)
      )

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
    return 'At least one channel must provide content.templateId or inline content (subject/body)'
  }
}

/**
 * Custom decorator for template XOR content validation
 * Applied at the DTO class level
 *
 * Usage: @ValidateTemplateOrContent()
 */
export function ValidateTemplateOrContent(validationOptions?: ValidationOptions) {
  // `target` in a class decorator is the constructor itself. Registering
  // `target.constructor` would bind the rule to `Function`, where class-validator never looks
  // for it, and the constraint would silently never run.
  return function (target: new (...args: any[]) => object) {
    registerDecorator({
      target: target as any,
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
