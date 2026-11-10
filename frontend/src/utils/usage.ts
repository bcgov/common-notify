import type { AdminTenantUsageRow, AdminUsageSummary } from '@/api/apiKeyUsage.api'
import { formatDate } from './dates'

/** Shared helpers for the notification usage & limits screens. */

/** One tenant of the admin usage table, with its per-channel rows. */
export type AdminTenantUsage = Pick<
  AdminTenantUsageRow,
  'tenantId' | 'tenantName' | 'sendingEnabled' | 'disabledReason' | 'disabledAt' | 'disabledBy'
> & { channels: AdminTenantUsageRow[] }

/** Tenant-by-channel rows as one entry per tenant, in the order the tenants first appear. */
export function groupUsageByTenant(rows: readonly AdminTenantUsageRow[]): AdminTenantUsage[] {
  const tenants = new Map<string, AdminTenantUsage>()
  for (const row of rows) {
    const tenant = tenants.get(row.tenantId)
    if (tenant) {
      tenant.channels.push(row)
      continue
    }
    const { tenantId, tenantName, sendingEnabled, disabledReason, disabledAt, disabledBy } = row
    tenants.set(tenantId, {
      tenantId,
      tenantName,
      sendingEnabled,
      disabledReason,
      disabledAt,
      disabledBy,
      channels: [row],
    })
  }
  return [...tenants.values()]
}

/** Usage as a percentage of a limit, rounded to five decimal places. */
export function percentOf(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0
  return Math.round((used / limit) * 1e7) / 1e5
}

/** "42 tenants use Notify · 30 sent this fiscal year · 2 disabled". */
export function adoptionSummaryText({
  tenants,
  sentThisFiscalYear,
  disabled,
}: AdminUsageSummary): string {
  const users = tenants === 1 ? 'tenant uses' : 'tenants use'
  return [
    `${tenants.toLocaleString()} ${users} Notify`,
    `${sentThisFiscalYear.toLocaleString()} sent this fiscal year`,
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
  return formatDate(iso)
}

/** "0", or "12 (0.4%)": failures with their share of the recipients sent to. */
export function formatFailures(failed: number, recipients: number): string {
  if (failed === 0) return '0'
  const share = Math.round(percentOf(failed, recipients) * 10) / 10
  return `${failed.toLocaleString()} (${share}%)`
}
