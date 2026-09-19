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
 * Date string validation for scheduling. A timezone is mandatory - a local time is ambiguous, and
 * guessing one would schedule the send at an hour nobody asked for.
 *
 * Accepted:
 * - `Z` suffix: "2026-04-28T08:55:00Z"
 * - numeric offset with a colon: "2026-04-28T08:55:00-07:00"
 * - a trailing 2-4 letter abbreviation the JS Date constructor knows: "2026-04-28 08:55:00 PDT"
 *   (PST/PDT/GMT/UTC parse; CEST does not)
 * - RFC 2822 with a zone: "Tue, 28 Apr 2026 09:31:00 GMT"
 *
 * Rejected: a local time with no zone, a bare date ("2026-04-28"), and a compact offset ("-0700").
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
