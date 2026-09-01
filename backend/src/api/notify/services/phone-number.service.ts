import { Injectable } from '@nestjs/common'
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js'

export const DEFAULT_PHONE_REGION: CountryCode = 'CA'

const FORMATTING_CHARACTERS = /[\s\-().]/g
const E164_PATTERN = /^\+[1-9]\d{1,14}$/

@Injectable()
export class PhoneNumberService {
  normalize(input: string, defaultRegion: string = DEFAULT_PHONE_REGION): string | null {
    if (typeof input !== 'string' || input.length === 0) return null

    const cleaned = input.replace(FORMATTING_CHARACTERS, '')

    try {
      const phoneNumber = parsePhoneNumberFromString(cleaned, defaultRegion as CountryCode)
      if (!phoneNumber || phoneNumber.ext || !phoneNumber.isValid()) return null

      return phoneNumber.number
    } catch {
      return null
    }
  }

  isValid(input: string): boolean {
    if (typeof input !== 'string' || !E164_PATTERN.test(input)) return false

    try {
      const phoneNumber = parsePhoneNumberFromString(input)
      return (
        !!phoneNumber && !phoneNumber.ext && phoneNumber.isValid() && phoneNumber.number === input
      )
    } catch {
      return false
    }
  }
}
