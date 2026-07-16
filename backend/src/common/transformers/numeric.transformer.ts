import { ValueTransformer } from 'typeorm'

/**
 * TypeORM transformer for bigint columns.
 *
 * Postgres bigint is returned as a string by the driver to avoid precision loss.
 * Our limit/usage values are well within Number.MAX_SAFE_INTEGER (2^53), so we
 * convert to a JS number on read for ergonomic use in services and JSON responses.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null || value === undefined ? null : Number(value),
}
