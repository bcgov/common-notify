/** The tenant request type (V84) for asking for a number. */
export const SMS_NUMBER_REQUEST_TYPE = 'sms_number'

// Swift has no transport yet: its numbers can be listed and assigned, and are used once one exists.
export const SMS_PROVIDER_CODES = ['aws', 'acs', 'twilio', 'swift'] as const
export const SMS_NUMBER_TYPE_CODES = ['long_code', 'toll_free', 'short_code', 'rcs'] as const

/** E.164, or a 5-6 digit short code: the same rule as V84's check constraint. */
export const SMS_NUMBER_PATTERN = /^(\+[1-9]\d{6,14}|\d{5,6})$/
