import { Injectable } from '@nestjs/common'
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js'

export const DEFAULT_PHONE_REGION: CountryCode = 'CA'

/**
 * Regions that are not international. Canada shares +1 with the rest of the North American
 * Numbering Plan and is told apart by area code; everything else on +1, the US included, counts as
 * international. libphonenumber assigns +1 toll-free numbers (800, 888, ...) to the US, so those
 * count as international too.
 */
const DOMESTIC_SMS_REGIONS: ReadonlySet<string> = new Set(['CA'])

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

  /**
   * Whether a number is outside Canada. False for anything that will not parse, which
   * is left for format validation to reject.
   */
  isInternational(input: string, defaultRegion: string = DEFAULT_PHONE_REGION): boolean {
    const normalised = this.normalize(input, defaultRegion)
    if (!normalised) return false

    const country = parsePhoneNumberFromString(normalised)?.country
    return !country || !DOMESTIC_SMS_REGIONS.has(country)
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
