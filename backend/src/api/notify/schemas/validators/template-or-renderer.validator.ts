import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'

/**
 * A stored template owns how it renders, so a request that names one must not also try to say.
 *
 * `templateId` cannot be combined with `subject`, `body`, `renderer`, `bodyType` or `encoding`.
 * The content and the rendering both belong to the stored template; `encoding` is read by nothing
 * at all. Allowing `bodyType` here was actively harmful: an MJML template resolves to `html`, and a
 * caller passing `markdown` (or `text`, which normalises to `markdown`) forced compiled MJML through
 * the markdown renderer.
 *
 * Applied at the channel level so it covers `/notifysimple` and the `/notifysimple/{email,sms}`
 * shorthands alike - those post a bare channel, which the request-level constraint never sees.
 */
@ValidatorConstraint({ name: 'validateTemplateOrRenderer', async: false })
export class TemplateOrRendererConstraint implements ValidatorConstraintInterface {
  // Registered at class level, where class-validator passes the instance on `args.object` and
  // leaves `value` undefined. The fallback keeps a directly-passed object working.
  validate(value: unknown, args?: ValidationArguments): boolean {
    const channel = (args?.object ?? value) as any

    const content = channel.content
    if (!content?.templateId) {
      return true
    }

    return (
      !content.subject &&
      !content.body &&
      !content.renderer &&
      !content.bodyType &&
      !content.encoding
    )
  }

  defaultMessage(): string {
    return (
      'content.templateId cannot be combined with subject, body, renderer, bodyType or encoding - ' +
      'a stored template provides its own content and rendering'
    )
  }
}

/**
 * Applied at the channel class level (NotifyEmailChannel, NotifySmsChannel, NotifyMsgAppChannel).
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
