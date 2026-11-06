import { Injectable } from '@nestjs/common'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { PhoneNumberService } from '../notify/services/phone-number.service'

export interface BulkValidationResult {
  valid: boolean
  errors: string[]
}

const RECIPIENT_COLUMN_KEYS: Partial<Record<NotificationChannel, string[]>> = {
  [NotificationChannel.EMAIL]: ['emailaddress', 'adressecourriel'],
  [NotificationChannel.SMS]: ['phonenumber', 'numérodetéléphone'],
}

/**
 * The index of the column naming the channel's recipient, or -1. Matches headers the way GC Notify
 * does: in any position, in English or French, ignoring case, whitespace, underscores and hyphens.
 */
export function findRecipientColumn(header: string[], channel: NotificationChannel): number {
  const keys = RECIPIENT_COLUMN_KEYS[channel] ?? []
  return header.findIndex(
    (value) =>
      typeof value === 'string' && keys.includes(value.replace(/[\s_-]/g, '').toLowerCase()),
  )
}

@Injectable()
export class GcNotifyBulkValidationService {
  constructor(private readonly phoneNumberService: PhoneNumberService) {}

  validateRows(rows: string[][]): BulkValidationResult {
    const header = Array.isArray(rows?.[0]) ? rows[0] : []
    const phoneNumberColumn = findRecipientColumn(header, NotificationChannel.SMS)

    if (phoneNumberColumn === -1) {
      const isEmailBulkRequest = findRecipientColumn(header, NotificationChannel.EMAIL) !== -1
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
      if (typeof value !== 'string' || this.phoneNumberService.normalize(value) === null) {
        errors.push(`Row ${rowNumber}: "${String(value ?? '')}" is not a valid E.164 phone number`)
      }
    }

    return { valid: errors.length === 0, errors }
  }
}
