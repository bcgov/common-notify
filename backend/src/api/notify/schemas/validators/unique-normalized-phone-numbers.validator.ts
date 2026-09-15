import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'
import { PhoneNumberService } from '../../services/phone-number.service'

/**
 * Used to make sure there are no duplicate SMS numbers when updating an Event's SMS settings
 */
@ValidatorConstraint({ name: 'hasUniqueNormalizedPhoneNumbers', async: false })
export class HasUniqueNormalizedPhoneNumbersConstraint implements ValidatorConstraintInterface {
  private readonly phoneNumberService = new PhoneNumberService()

  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return true

    return this.findDuplicateIndex(value) === -1
  }

  defaultMessage(args: ValidationArguments): string {
    if (!Array.isArray(args.value)) return `${args.property} contains duplicate phone numbers`

    const duplicateIndex = this.findDuplicateIndex(args.value)
    if (duplicateIndex === -1) return `${args.property} contains duplicate phone numbers`

    const normalized = this.phoneNumberService.normalize(args.value[duplicateIndex])
    const firstIndex = args.value.findIndex(
      (entry: unknown, index: number) =>
        index !== duplicateIndex &&
        typeof entry === 'string' &&
        this.phoneNumberService.normalize(entry) === normalized,
    )

    return (
      `${args.property}[${duplicateIndex}] (${JSON.stringify(args.value[duplicateIndex])}) ` +
      `is a duplicate of ${args.property}[${firstIndex}] (${JSON.stringify(args.value[firstIndex])})`
    )
  }

  /** Index of the first entry whose normalized value repeats an earlier entry's, or -1. */
  private findDuplicateIndex(value: unknown[]): number {
    const seen = new Set<string>()

    for (let index = 0; index < value.length; index++) {
      const entry = value[index]
      if (typeof entry !== 'string') continue

      const normalized = this.phoneNumberService.normalize(entry)
      if (!normalized) continue

      if (seen.has(normalized)) return index
      seen.add(normalized)
    }

    return -1
  }
}

export function HasUniqueNormalizedPhoneNumbers(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: HasUniqueNormalizedPhoneNumbersConstraint,
    })
  }
}
