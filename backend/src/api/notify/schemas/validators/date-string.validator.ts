import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'

/**
 * Validator constraint for flexible date string parsing
 */
@ValidatorConstraint({ name: 'isValidDateString', async: false })
export class IsValidDateStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false
    // Try to parse as date - JavaScript's Date constructor is lenient
    const date = new Date(value)
    return !isNaN(date.getTime())
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid date string (accepts ISO 8601, RFC 2822, and other standard formats like "2026-04-28 8:55:00 PST")`
  }
}

/**
 * Custom decorator for flexible date string validation
 * Accepts multiple date formats including:
 * - ISO 8601: "2026-04-28T08:55:00Z"
 * - RFC 2822: "2026-04-28T08:55:00+00:00"
 * - Relaxed format with timezone: "2026-04-28 8:55:00 PST"
 * - Other standard date formats that JavaScript's Date constructor can parse
 *
 * Usage: @IsValidDateString()
 */
export function IsValidDateString(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidDateStringConstraint,
    })
  }
}
