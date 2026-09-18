import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'

/**
 * Validator constraint for template ID XOR renderer constraint
 *
 * Business rule: A channel must use EITHER:
 * - A templateId (pre-built template), OR
 * - Inline content with a renderer (template rendering engine)
 *
 * But NOT both at the same time.
 */
@ValidatorConstraint({ name: 'validateTemplateOrRenderer', async: false })
export class TemplateOrRendererConstraint implements ValidatorConstraintInterface {
  // Registered at class level, where class-validator passes the instance on `args.object` and
  // leaves `value` undefined. The fallback keeps a directly-passed object working.
  validate(value: unknown, args?: ValidationArguments): boolean {
    const channel = (args?.object ?? value) as any

    const hasTemplateId = !!channel.content?.templateId
    const hasRenderer = !!channel.content?.renderer

    // Cannot use both templateId and renderer
    if (hasTemplateId && hasRenderer) {
      return false
    }

    return true
  }

  defaultMessage(): string {
    return 'Channel must use either templateId (pre-built template) OR content.renderer (inline rendering), but not both'
  }
}

/**
 * Custom decorator for template ID XOR renderer validation
 * Applied at the channel class level (NotifyEmailChannel, NotifySmsChannel, NotifyMsgAppChannel)
 *
 * Usage: @ValidateTemplateOrRenderer()
 */
export function ValidateTemplateOrRenderer(validationOptions?: ValidationOptions) {
  // `target` in a class decorator is the constructor itself. Registering
  // `target.constructor` would bind the rule to `Function`, where class-validator never looks
  // for it, and the constraint would silently never run.
  return function (target: new (...args: any[]) => object) {
    registerDecorator({
      target: target as any,
      propertyName: undefined as any,
      options: validationOptions,
      constraints: [],
      validator: TemplateOrRendererConstraint,
    })
  }
}
