/**
 * Usage counter granularity.
 * Mirrors the seeded values in notify.usage_period_type_code (migration V40).
 */
export enum UsagePeriodType {
  MINUTE = 'MINUTE',
  DAY = 'DAY',
  YEAR = 'YEAR',
}
