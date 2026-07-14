import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'

/**
 * Validator constraint for the recipients XOR mergeArray constraint.
 *
 * A recipients object specifies its addressees as either:
 * - direct lists (`to`/`cc`/`bcc`) for a single notification with multiple recipients, or
 * - a `mergeArray` for a mail-merge (multiple custom notifications to specified recipients)
 *
 * but never both, and at least one must be present.
 */
@ValidatorConstraint({ name: 'isValidRecipientsOrMerge', async: false })
export class RecipientsOrMergeConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    const recipients = (value ?? {}) as {
      to?: any
      cc?: any
      bcc?: any
      mergeArray?: any
    }

    const hasDirect =
      Array.isArray(recipients.to) || Array.isArray(recipients.cc) || Array.isArray(recipients.bcc)
    const hasMerge = Array.isArray(recipients.mergeArray)

    // Exactly one of (direct lists) or (mergeArray) must be present
    return hasDirect !== hasMerge
  }

  defaultMessage(): string {
    return 'recipients must provide either to/cc/bcc OR mergeArray, but not both'
  }
}

/**
 * Property-level decorator validating recipients XOR mergeArray. Applied to the always-present
 * `recipients` property of a channel so it actually runs through the global ValidationPipe.
 */
export function ValidateRecipientsOrMerge(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidRecipientsOrMerge',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: RecipientsOrMergeConstraint,
    })
  }
}
