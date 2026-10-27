import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'
import { isBlockedWebhookHeader } from '../webhook-headers'

@ValidatorConstraint({ name: 'allowedWebhookHeaders', async: false })
export class AllowedWebhookHeadersConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    return Object.entries(value).every(
      ([name, headerValue]) => typeof headerValue === 'string' && !isBlockedWebhookHeader(name),
    )
  }

  defaultMessage(args: ValidationArguments): string {
    const value = args.value
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return `${args.property} must be an object of header names to string values`
    }
    const entries = Object.entries(value as Record<string, unknown>)
    const blocked = entries.filter(([name]) => isBlockedWebhookHeader(name)).map(([name]) => name)
    if (blocked.length > 0) {
      return `${args.property} may not set ${blocked.join(', ')}`
    }
    const nonString = entries.filter(([, v]) => typeof v !== 'string').map(([name]) => name)
    return `${args.property} values must be strings (${nonString.join(', ')})`
  }
}

export function AllowedWebhookHeaders(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: AllowedWebhookHeadersConstraint,
    })
  }
}
