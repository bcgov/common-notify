import { toReadableError } from '@/utils/apiErrorMessage'
import { get, patch, generateApiParameters } from '@/common/api'
import type { PaginatedResponse } from '@/interfaces/PaginatedNotificationResponse'
import { toListQueryString } from './listQuery'

/**
 * API Key Usage / Limits API
 *
 * Frontend-facing endpoints for the authenticated tenant's notification limits and usage.
 * Backed by /api/v1/frontend/api-key-usage (NotifyFrontendRoleGuard + CSTAR roles).
 * The selected tenant is resolved server-side from the X-Tenant-ID header, which the
 * axios request interceptor attaches automatically.
 */

const BASE_URL = '/api/v1/frontend/api-key-usage'

export interface ChannelUsage {
  channel: string
  rateLimitPerMinute: number
  dailyLimit: number
  annualLimit: number
  warnThresholdPercent: number
  usedThisMinute: number
  usedToday: number
  usedThisYear: number
}

export interface TenantUsageResponse {
  tenantId: string
  fiscalYearStart: string
  channels: ChannelUsage[]
}

export interface UsageHistoryEntry {
  channel: string
  fiscalYearStart: string
  sentCount: number
}

export interface UpdateThresholdRequest {
  channel: string
  warnThresholdPercent: number
}

export interface AdminTenantUsageRow {
  tenantId: string
  tenantName: string
  channel: string
  /** The limit fields are null when the tenant has no limit on this channel, e.g. no API key. */
  rateLimitPerMinute: number | null
  dailyLimit: number | null
  annualLimit: number | null
  warnThresholdPercent: number | null
  usedThisMinute: number
  usedToday: number
  usedThisYear: number
  /** False when an admin has disabled sending for the tenant; the disabled* fields say why. */
  sendingEnabled: boolean
  disabledReason: string | null
  disabledAt: string | null
  disabledBy: string | null
  /** ISO time of the tenant's last send on this channel, from any source; null if never. */
  lastSentAt: string | null
  /** Recipients per month over the last 12 full months; null with no full month yet. */
  averageMonthlySends: number | null
  /** Recipients sent to on this channel in the last 30 days, and how many of them failed. */
  recipientsLast30Days: number
  failedLast30Days: number
}

export type PaginatedAdminUsageResponse = PaginatedResponse<AdminTenantUsageRow>

/** How many tenants use Notify, across every tenant whatever the table's search or filters. */
export interface AdminUsageSummary {
  tenants: number
  sentThisFiscalYear: number
  /** Tenants an admin has disabled from sending. */
  disabled: number
}

/** A tenant the admin usage table can list. */
export interface AdminTenantOption {
  id: string
  name: string
}

export interface UpdateTenantLimitsRequest {
  tenantId: string
  channel: string
  dailyLimit: number
  annualLimit: number
}

/**
 * Get current usage vs configured limits for the selected tenant.
 */
export async function getApiKeyUsage(): Promise<TenantUsageResponse> {
  try {
    const params = generateApiParameters(BASE_URL)
    return await get<TenantUsageResponse>(params)
  } catch (error) {
    throw toReadableError(error, 'usage')
  }
}

/**
 * Get per-fiscal-year usage history for the selected tenant.
 */
export async function getApiKeyUsageHistory(): Promise<UsageHistoryEntry[]> {
  try {
    const params = generateApiParameters(`${BASE_URL}/history`)
    return await get<UsageHistoryEntry[]>(params)
  } catch (error) {
    throw toReadableError(error, 'usage history')
  }
}

/**
 * Update the alert threshold for a channel. Requires NOTIFY_OPERATIONS_ADMIN.
 * Returns the refreshed tenant usage.
 */
export async function updateApiKeyThreshold(
  data: UpdateThresholdRequest,
): Promise<TenantUsageResponse> {
  try {
    const params = generateApiParameters(`${BASE_URL}/threshold`, data)
    return await patch<TenantUsageResponse>(params)
  } catch (error) {
    throw toReadableError(error, 'threshold')
  }
}

/**
 * Get a paginated page of usage vs limits across tenants (one row per tenant × channel),
 * optionally filtered by tenant name and `field:in:values` filters, and sorted by a usage total
 * (`usedToday`, or `-usedToday` for descending). Pagination is by tenant.
 * Requires NOTIFY_ADMIN. Backed by /api/v1/frontend/admin/api-key-usage.
 */
export async function getAllTenantsUsage(
  page: number = 1,
  limit: number = 15,
  search?: string,
  filter?: string[],
  sort?: string,
): Promise<PaginatedAdminUsageResponse> {
  try {
    const qs = toListQueryString({ page, limit, search, sort, filter })
    const params = generateApiParameters(`/api/v1/frontend/admin/api-key-usage?${qs}`)
    return await get<PaginatedAdminUsageResponse>(params)
  } catch (error) {
    throw toReadableError(error, 'tenant usage')
  }
}

/** Enable or disable sending for a tenant. A reason is required to disable. Requires NOTIFY_ADMIN. */
export async function setTenantSending(
  tenantId: string,
  enabled: boolean,
  reason?: string,
): Promise<{ sendingEnabled: boolean }> {
  try {
    const params = generateApiParameters(
      `/api/v1/frontend/admin/api-key-usage/tenants/${encodeURIComponent(tenantId)}/sending`,
      enabled ? { enabled } : { enabled, reason },
    )
    return await patch<{ sendingEnabled: boolean }>(params)
  } catch (error) {
    throw toReadableError(error, 'tenant sending')
  }
}

/** How many tenants use Notify. Requires NOTIFY_ADMIN. */
export async function getAdminUsageSummary(): Promise<AdminUsageSummary> {
  try {
    const params = generateApiParameters('/api/v1/frontend/admin/api-key-usage/summary')
    return await get<AdminUsageSummary>(params)
  } catch (error) {
    throw toReadableError(error, 'tenant summary')
  }
}

/** Every tenant the admin usage table can list, by name: the options for its search. */
export async function getAdminUsageTenants(): Promise<AdminTenantOption[]> {
  try {
    const params = generateApiParameters('/api/v1/frontend/admin/api-key-usage/tenants')
    return await get<AdminTenantOption[]>(params)
  } catch (error) {
    throw toReadableError(error, 'tenants')
  }
}

/**
 * Update a tenant's daily and annual limits for a channel. Requires NOTIFY_ADMIN.
 * Returns the tenant's refreshed usage rows.
 */
export async function updateTenantLimits(
  data: UpdateTenantLimitsRequest,
): Promise<AdminTenantUsageRow[]> {
  try {
    const params = generateApiParameters('/api/v1/frontend/admin/api-key-usage/limits', data)
    return await patch<AdminTenantUsageRow[]>(params)
  } catch (error) {
    throw toReadableError(error, 'tenant limits')
  }
}
