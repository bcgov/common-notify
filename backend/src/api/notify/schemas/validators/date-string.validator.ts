import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'

/**
 * Validator constraint for flexible date string parsing
 * Requires timezone information to avoid ambiguity in scheduling
 */
@ValidatorConstraint({ name: 'isValidDateString', async: false })
export class IsValidDateStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false

    // Must have timezone in one of these formats:
    // 1. Z suffix for UTC: "2026-04-28T09:31:00Z"
    // 2. Offset format: "2026-04-28T09:31:00+00:00" or "2026-04-28T09:31:00-07:00"
    // 3. Timezone abbreviation: "2026-04-28 09:31:00 PST" or "2026-04-28 09:31:00 PDT"
    const hasTimezoneFormat =
      value.endsWith('Z') || // UTC
      /[+-]\d{2}:\d{2}$/.test(value) || // Offset format
      /\s[A-Z]{2,4}$/.test(value) // TZ abbreviation (2-4 letters)

    if (!hasTimezoneFormat) {
      return false
    }

    // Validate the date can be parsed by JavaScript
    const date = new Date(value)
    return !isNaN(date.getTime())
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid date string with timezone (e.g., "2026-04-28T09:31:00Z", "2026-04-28T09:31:00-07:00", or "2026-04-28 09:31:00 PDT")`
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
