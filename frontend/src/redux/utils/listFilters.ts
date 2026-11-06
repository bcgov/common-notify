/**
 * DataTable column filters, `{ channel: ['EMAIL', 'SMS'] }`, as the `filter` params the list
 * endpoints read (`channel:in:EMAIL|SMS`). Columns with nothing selected are left out; undefined
 * when no column is filtered, so the param is not sent at all.
 */
export function toFilterParams(filters: Record<string, string[]>): string[] | undefined {
  const params = Object.entries(filters)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => `${field}:in:${values.join('|')}`)
  return params.length > 0 ? params : undefined
}
