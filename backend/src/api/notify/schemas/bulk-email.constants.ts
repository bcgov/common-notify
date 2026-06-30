/** Maximum number of recipients allowed in a single bulk email send. */
export const BULK_EMAIL_MAX_RECIPIENTS = 50000

/** Maximum array size for bulk rows (header row + BULK_EMAIL_MAX_RECIPIENTS data rows). */
export const BULK_EMAIL_MAX_ROWS = BULK_EMAIL_MAX_RECIPIENTS + 1

/** Cap on the number of per-row email errors returned so a malformed file does not produce an unbounded response. */
export const BULK_EMAIL_MAX_REPORTED_ERRORS = 100
