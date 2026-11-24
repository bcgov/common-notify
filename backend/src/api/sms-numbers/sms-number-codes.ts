/** The tenant request type (V84) for asking for a number. */
export const SMS_NUMBER_REQUEST_TYPE = 'sms_number'

// Swift has no transport yet: its numbers can be listed and assigned, and are used once one exists.
export const SMS_PROVIDER_CODES = ['aws', 'acs', 'twilio', 'swift'] as const
export const SMS_NUMBER_TYPE_CODES = ['long_code', 'toll_free', 'short_code', 'rcs'] as const

/** E.164, or a 5-6 digit short code: the same rule as V84's check constraint. */
export const SMS_NUMBER_PATTERN = /^(\+[1-9]\d{6,14}|\d{5,6})$/

type SmsNumberTypeCode = (typeof SMS_NUMBER_TYPE_CODES)[number]

/**
 * What a number of each type looks like, within SMS_NUMBER_PATTERN. RCS has no narrower rule yet.
 * The admin page's form mirrors these in numberTypeRules.ts.
 */
const NUMBER_TYPE_RULES: Record<SmsNumberTypeCode, { pattern: RegExp; format: string }> = {
  long_code: { pattern: /^\+[1-9]\d{6,14}$/, format: 'an E.164 number, such as +15551234567' },
  toll_free: {
    pattern: /^\+18(00|33|44|55|66|77|88)\d{7}$/,
    format: 'a North American toll-free number, such as +18005551234',
  },
  short_code: { pattern: /^\d{5,6}$/, format: 'a 5-6 digit short code' },
  rcs: { pattern: SMS_NUMBER_PATTERN, format: 'an E.164 number or a 5-6 digit short code' },
}

/** Why a number does not fit its type, or null if it does. */
export function numberTypeMismatch(phoneNumber: string, numberTypeCode: string): string | null {
  const rule = NUMBER_TYPE_RULES[numberTypeCode as SmsNumberTypeCode]
  if (!rule || rule.pattern.test(phoneNumber)) return null
  return `${phoneNumber} does not fit its type: enter ${rule.format}`
}
