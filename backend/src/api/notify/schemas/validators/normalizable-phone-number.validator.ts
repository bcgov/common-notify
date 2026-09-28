import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'
import { PhoneNumberService } from '../../services/phone-number.service'

@ValidatorConstraint({ name: 'isNormalizablePhoneNumber', async: false })
export class IsNormalizablePhoneNumberConstraint implements ValidatorConstraintInterface {
  private readonly phoneNumberService = new PhoneNumberService()

  validate(value: unknown): boolean {
    return typeof value === 'string' && this.phoneNumberService.normalize(value) !== null
  }

  defaultMessage(args: ValidationArguments): string {
    if (Array.isArray(args.value)) {
      const invalidValues = args.value
        .map((value, index) => ({ value, index }))
        .filter(
          ({ value }) =>
            typeof value !== 'string' || this.phoneNumberService.normalize(value) === null,
        )
        .map(({ value, index }) => `${args.property}[${index}] (${JSON.stringify(value)})`)

      return `${invalidValues.join(', ')} is not a valid phone number`
    }

    return '$value is not a valid phone number'
  }
}

export function IsNormalizablePhoneNumber(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNormalizablePhoneNumberConstraint,
    })
  }
}
