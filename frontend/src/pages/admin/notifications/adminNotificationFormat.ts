export const CHANNEL_FILTER_OPTIONS = [
  { label: 'Email', value: 'EMAIL' },
  { label: 'SMS', value: 'SMS' },
  { label: 'MsgApp', value: 'MSGAPP' },
]

/** A timestamp to the second, in the admin's locale: troubleshooting needs more than the day. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}
