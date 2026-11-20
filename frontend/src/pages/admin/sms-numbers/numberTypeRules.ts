/** How a number of a type must look, and how the form explains it. */
export interface NumberTypeRule {
  pattern: RegExp
  /** Helper text under the number field. */
  hint: string
  /** Shown when the number does not fit. */
  error: string
}

/** E.164, or a 5-6 digit short code: every type falls within it, and RCS has no narrower rule. */
const GENERAL_RULE: NumberTypeRule = {
  pattern: /^(\+[1-9]\d{6,14}|\d{5,6})$/,
  hint: 'E.164, such as +15551234567, or a 5-6 digit short code',
  error: 'Enter an E.164 number or a 5-6 digit short code.',
}

/** The backend's rules in sms-number-codes.ts, which it enforces on add and on a change of type. */
const RULES: Record<string, NumberTypeRule> = {
  long_code: {
    pattern: /^\+[1-9]\d{6,14}$/,
    hint: 'E.164, such as +15551234567',
    error: 'Enter a long code in E.164 format, such as +15551234567.',
  },
  toll_free: {
    pattern: /^\+18(00|33|44|55|66|77|88)\d{7}$/,
    hint: 'E.164, starting +1800, +1833, +1844, +1855, +1866, +1877 or +1888',
    error: 'Enter a North American toll-free number, such as +18005551234.',
  },
  short_code: {
    pattern: /^\d{5,6}$/,
    hint: '5 or 6 digits, such as 12345',
    error: 'Enter a 5 or 6 digit short code.',
  },
}

export const numberTypeRule = (numberTypeCode: string): NumberTypeRule =>
  RULES[numberTypeCode] ?? GENERAL_RULE
