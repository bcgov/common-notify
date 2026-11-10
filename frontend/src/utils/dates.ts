/** A date as "Nov 9, 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** A timestamp to the second, as "Nov 9, 2026, 3:22:45 p.m.", or a dash for none. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'medium' })
}

/** A local date as YYYY-MM-DD, `daysAgo` days before today. */
export function localDay(daysAgo = 0): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
