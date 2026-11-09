import type { AdminUsageSummary } from '@/api/apiKeyUsage.api'

/** Shared helpers for the notification usage & limits screens. */

/** Title-case a channel code, e.g. EMAIL -> Email. */
export function formatChannel(channel: string): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1).toLowerCase()
}

/** Usage as a percentage of a limit, rounded to five decimal places. */
export function percentOf(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0
  return Math.round((used / limit) * 1e7) / 1e5
}

/** "42 tenants use Notify · 30 sent this fiscal year · 12 with an API key". */
export function adoptionSummaryText({
  tenants,
  sentThisFiscalYear,
  withApiKey,
  disabled,
}: AdminUsageSummary): string {
  const users = tenants === 1 ? 'tenant uses' : 'tenants use'
  return [
    `${tenants.toLocaleString()} ${users} Notify`,
    `${sentThisFiscalYear.toLocaleString()} sent this fiscal year`,
    `${withApiKey.toLocaleString()} with an API key`,
    // Only when there are any: "0 disabled" is noise on every visit.
    ...(disabled > 0 ? [`${disabled.toLocaleString()} disabled`] : []),
  ].join(' · ')
}

const DAY_MS = 24 * 60 * 60 * 1000

/** "Today", "Yesterday", "12 days ago", or the date once it's more than a month back. */
export function formatLastSent(iso: string, now: number): string {
  const days = Math.floor((now - new Date(iso).getTime()) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 31) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** "0", or "12 (0.4%)": failures with their share of the recipients sent to. */
export function formatFailures(failed: number, recipients: number): string {
  if (failed === 0) return '0'
  const share = Math.round(percentOf(failed, recipients) * 10) / 10
  return `${failed.toLocaleString()} (${share}%)`
}
