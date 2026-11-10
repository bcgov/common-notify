import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

// Mirrors backend/src/api/notify/services/phone-number.service.ts's normalize/isValid logic, so
// a number accepted here is accepted by the backend's IsNormalizablePhoneNumber validator too.
const DEFAULT_PHONE_REGION = 'CA'
const FORMATTING_CHARACTERS = /[\s\-().]/g

// Returns the E.164 form, or null if `value` isn't a resolvable phone number.
export function normalizePhone(value: string): string | null {
  const cleaned = value.replace(FORMATTING_CHARACTERS, '')

  try {
    const phoneNumber = parsePhoneNumberFromString(cleaned, DEFAULT_PHONE_REGION)
    return phoneNumber && !phoneNumber.ext && phoneNumber.isValid() ? phoneNumber.number : null
  } catch {
    return null
  }
}

export function isValidPhone(value: string): boolean {
  return normalizePhone(value) !== null
}

// Mirrors PhoneNumberService.isInternational: anything outside Canada, the US included. False for
// a number that won't normalize, which isValidPhone already flags.
export function isInternationalPhone(value: string): boolean {
  const normalized = normalizePhone(value)
  return normalized !== null && parsePhoneNumberFromString(normalized)?.country !== 'CA'
}

// Differently formatted entries can normalize to the same E.164 number (e.g. "2505551234" and
// "250-555-1234"); TagListField only catches exact-string repeats, so flag later entries whose
// normalized form repeats an earlier one, the same way a malformed number is flagged, instead of
// letting the form silently drop them.
export function duplicatePhoneNumbers(addresses: string[]): string[] {
  const seen = new Set<string>()
  const duplicates: string[] = []

  for (const address of addresses) {
    const normalized = normalizePhone(address)
    if (normalized === null) continue
    if (seen.has(normalized)) {
      duplicates.push(address)
    } else {
      seen.add(normalized)
    }
  }

  return duplicates
}
