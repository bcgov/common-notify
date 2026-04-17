/** Maximum number of recipients allowed in a bulk send (header row + data rows = 50,001). */
export const BULK_MAX_RECIPIENTS = 50000;

/** Maximum array size for bulk rows (header + BULK_MAX_RECIPIENTS). */
export const BULK_MAX_ROWS = BULK_MAX_RECIPIENTS + 1;
