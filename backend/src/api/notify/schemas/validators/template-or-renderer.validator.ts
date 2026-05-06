import {
  registerDecorator,
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
  validate(value: unknown): boolean {
    const channel = value as any

    const hasTemplateId = !!channel.templateId
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
  return function (target: object) {
    registerDecorator({
      target: target.constructor as any,
      propertyName: undefined as any,
      options: validationOptions,
      constraints: [],
      validator: TemplateOrRendererConstraint,
    })
  }
}
