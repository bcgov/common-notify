import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'
import { PhoneNumberService } from '../../services/phone-number.service'

@ValidatorConstraint({ name: 'isE164', async: false })
export class IsE164Constraint implements ValidatorConstraintInterface {
  private readonly phoneNumberService = new PhoneNumberService()

  validate(value: unknown): boolean {
    return typeof value === 'string' && this.phoneNumberService.isValid(value)
  }

  defaultMessage(args: ValidationArguments): string {
    if (Array.isArray(args.value)) {
      const invalidValues = args.value
        .map((value, index) => ({ value, index }))
        .filter(({ value }) => typeof value !== 'string' || !this.phoneNumberService.isValid(value))
        .map(({ value, index }) => `${args.property}[${index}] (${JSON.stringify(value)})`)

      return `${invalidValues.join(', ')} is not a valid E.164 phone number`
    }

    return '$value is not a valid E.164 phone number'
  }
}

export function IsE164(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsE164Constraint,
    })
  }
}
