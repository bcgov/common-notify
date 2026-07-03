import type { AxiosError } from 'axios'
import { get, patch, generateApiParameters, STATUS_CODES } from '@/common/api'

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
  rateLimitPerMinute: number
  dailyLimit: number
  annualLimit: number
  warnThresholdPercent: number
  usedThisMinute: number
  usedToday: number
  usedThisYear: number
}

export interface PaginatedAdminUsageResponse {
  data: AdminTenantUsageRow[]
  count: number
  page: number
  limit: number
  totalPages: number
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
 * optionally filtered by tenant name. Pagination is by tenant. Requires NOTIFY_ADMIN.
 * Backed by /api/v1/frontend/admin/api-key-usage.
 */
export async function getAllTenantsUsage(
  page: number = 1,
  limit: number = 15,
  search?: string,
): Promise<PaginatedAdminUsageResponse> {
  try {
    const params = generateApiParameters('/api/v1/frontend/admin/api-key-usage', {
      page: String(page),
      limit: String(limit),
      ...(search ? { search } : {}),
    })
    return await get<PaginatedAdminUsageResponse>(params)
  } catch (error) {
    throw toReadableError(error, 'tenant usage')
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

function toReadableError(error: unknown, resource: string): Error {
  const axiosError = error as AxiosError
  const responseData = (axiosError.response?.data as any) || {}

  if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
    return new Error(`You are not authorized to view ${resource}`)
  }
  if (axiosError.response?.status === STATUS_CODES.Forbidden) {
    return new Error(`You do not have permission to modify the ${resource}`)
  }

  return new Error(
    `Failed to load ${resource}: ${
      responseData.message || (error instanceof Error ? error.message : 'Unknown error')
    }`,
  )
}
