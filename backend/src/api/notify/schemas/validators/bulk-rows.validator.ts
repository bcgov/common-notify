import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator'
import { BULK_EMAIL_ADDRESS_HEADER } from '../bulk-email.constants'

/**
 * Validator constraint for the bulk-send `rows` structure.
 *
 * Structural rules (per-row email format is checked separately by
 * NotifyService.validateBulkRows, which returns row-indexed 422 errors):
 * - rows is an array of arrays
 * - the first (header) row contains an "email address" column (case-insensitive)
 * - every data row has the same number of columns as the header
 */
@ValidatorConstraint({ name: 'isValidBulkRows', async: false })
export class BulkRowsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value) || value.length < 2) {
      return false
    }

    const header = value[0]
    if (!Array.isArray(header)) {
      return false
    }

    const emailColumnIndex = header.findIndex(
      (col) => typeof col === 'string' && col.trim().toLowerCase() === BULK_EMAIL_ADDRESS_HEADER,
    )
    if (emailColumnIndex === -1) {
      return false
    }

    for (let i = 1; i < value.length; i++) {
      const row = value[i]
      if (!Array.isArray(row) || row.length !== header.length) {
        return false
      }
    }

    return true
  }

  defaultMessage(): string {
    return `rows must be an array of arrays whose header row includes an "${BULK_EMAIL_ADDRESS_HEADER}" column, with every data row matching the header column count`
  }
}

/**
 * Property-level decorator validating the bulk-send `rows` structure.
 *
 * Usage: apply to the `rows` property of the bulk request DTO.
 */
export function IsValidBulkRows(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: BulkRowsConstraint,
    })
  }
}
