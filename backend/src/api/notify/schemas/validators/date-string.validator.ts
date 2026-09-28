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

/**
 * Scheduling a send into the past is never what a caller meant, but it used to be accepted: the
 * delay is computed as `Math.max(0, when - now)`, so a stale timestamp silently sent immediately.
 *
 * A minute of slack is allowed because the caller's clock is not ours. A client that computes "now"
 * and posts it should not be rejected for being a few seconds behind, and a minute is far short of
 * any interval a scheduled send is worth expressing.
 */
const CLOCK_SKEW_TOLERANCE_MS = 60_000

@ValidatorConstraint({ name: 'isFutureDateString', async: false })
export class IsFutureDateStringConstraint implements ValidatorConstraintInterface {
  private readonly dateString = new IsValidDateStringConstraint()

  validate(value: unknown): boolean {
    if (!this.dateString.validate(value)) {
      return false
    }

    return new Date(value as string).getTime() >= Date.now() - CLOCK_SKEW_TOLERANCE_MS
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a future date string with a timezone (for example "${new Date(
      Date.now() + 3_600_000,
    ).toISOString()}")`
  }
}

/** {@link IsValidDateString}, and the time must not be in the past. */
export function IsFutureDateString(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsFutureDateStringConstraint,
    })
  }
}
