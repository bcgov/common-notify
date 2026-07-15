/** Maximum number of recipients allowed in a single mail merge send. */
export const MAIL_MERGE_MAX_RECIPIENTS = 50000

/** Maximum array size for mail merge mergeArray (header row + MAIL_MERGE_MAX_RECIPIENTS data rows). */
export const MAIL_MERGE_MAX_ROWS = MAIL_MERGE_MAX_RECIPIENTS + 1

/** Cap on the number of per-row email errors returned so a malformed file does not produce an unbounded response. */
export const MAIL_MERGE_MAX_REPORTED_ERRORS = 100
