/** Codes seeded by V81. The code tables are the source of truth; these name the ones code relies on. */
export enum SmsNumberRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  /** Approved, then the number was released from the tenant. */
  RELEASED = 'released',
  /** Cancelled by the tenant while pending. */
  CANCELLED = 'cancelled',
}

// Swift has no transport yet: its numbers can be listed and assigned, and are used once one exists.
export const SMS_PROVIDER_CODES = ['aws', 'acs', 'twilio', 'swift'] as const
export const SMS_NUMBER_TYPE_CODES = ['long_code', 'toll_free', 'short_code', 'rcs'] as const

/** E.164, or a 5-6 digit short code: the same rule as V81's check constraint. */
export const SMS_NUMBER_PATTERN = /^(\+[1-9]\d{6,14}|\d{5,6})$/
