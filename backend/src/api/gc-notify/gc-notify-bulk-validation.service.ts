import { Injectable } from '@nestjs/common'
import { PhoneNumberService } from '../notify/services/phone-number.service'

export interface BulkValidationResult {
  valid: boolean
  errors: string[]
}

const PHONE_NUMBER_HEADER = 'phone number'
const EMAIL_ADDRESS_HEADER = 'email address'

@Injectable()
export class GcNotifyBulkValidationService {
  constructor(private readonly phoneNumberService: PhoneNumberService) {}

  validateRows(rows: string[][]): BulkValidationResult {
    const header = Array.isArray(rows?.[0]) ? rows[0] : []
    const phoneNumberColumn = header.findIndex(
      (value) => typeof value === 'string' && value.trim().toLowerCase() === PHONE_NUMBER_HEADER,
    )

    if (phoneNumberColumn === -1) {
      const isEmailBulkRequest = header.some(
        (value) => typeof value === 'string' && value.trim().toLowerCase() === EMAIL_ADDRESS_HEADER,
      )
      if (isEmailBulkRequest) return { valid: true, errors: [] }

      return {
        valid: false,
        errors: ['A phone number column could not be identified in the header row'],
      }
    }

    const errors: string[] = []
    for (let rowNumber = 1; rowNumber < rows.length; rowNumber++) {
      const row = rows[rowNumber]
      const value = Array.isArray(row) ? row[phoneNumberColumn] : undefined
      if (typeof value !== 'string' || !this.phoneNumberService.isValid(value)) {
        errors.push(`Row ${rowNumber}: "${String(value ?? '')}" is not a valid E.164 phone number`)
      }
    }

    return { valid: errors.length === 0, errors }
  }
}
