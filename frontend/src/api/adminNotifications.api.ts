import type { AxiosError } from 'axios'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'

/**
 * Notification requests across every tenant, for admins troubleshooting a send. Requires
 * NOTIFY_ADMIN; not tenant-scoped. Nothing here carries a recipient address or message content.
 */
const BASE_URL = '/api/v1/frontend/admin/notifications'

export interface AdminNotificationRow {
  id: string
  tenantId: string
  tenantName: string
  status: { code: string; displayName: string }
  channels: string[]
  requestRoute: string | null
  createdAt: string
  scheduledFor: string | null
  /** Deliveries: one per recipient per channel. */
  recipientCount: number
  failedCount: number
}

export interface AdminDeliveryCount {
  channel: string
  status: string
  count: number
}

export interface AdminStatusChange {
  status: string
  at: string
}

export interface AdminNotificationDetail extends AdminNotificationRow {
  updatedAt: string
  /** Request-level error, with recipient addresses redacted. */
  errorReason: string | null
  quarantine: { viruses: string[]; reason: string; scannedAt: string } | null
  deliveryCounts: AdminDeliveryCount[]
  /** Oldest first. */
  statusHistory: AdminStatusChange[]
  /** Grafana Explore link to the backend logs for this request; null when running locally. */
  logsUrl: string | null
}

export interface AdminDelivery {
  id: string
  channel: string
  status: string
  attemptCount: number
  lastAttemptAt: string | null
  errorMessage: string | null
  providerResponseId: string | null
  providerResponse: string | null
}

export interface Paginated<T> {
  data: T[]
  count: number
  page: number
  limit: number
  totalPages: number
}

export interface AdminListQuery {
  page: number
  limit: number
  search?: string
  sort?: string
  filter?: string[]
}

function toQueryString({ page, limit, search, sort, filter }: AdminListQuery): string {
  const qs = new URLSearchParams()
  qs.set('page', String(page))
  qs.set('limit', String(limit))
  if (search) qs.set('search', search)
  if (sort) qs.set('sort', sort)
  filter?.forEach((f) => qs.append('filter', f))
  return qs.toString()
}

/** A page of requests, newest first, filtered by tenant name, status, channel and date. */
export async function listAdminNotifications(
  query: AdminListQuery,
): Promise<Paginated<AdminNotificationRow>> {
  try {
    return await get(generateApiParameters(`${BASE_URL}?${toQueryString(query)}`))
  } catch (error) {
    throw toReadableError(error, 'notifications')
  }
}

export async function getAdminNotification(id: string): Promise<AdminNotificationDetail> {
  try {
    return await get(generateApiParameters(`${BASE_URL}/${encodeURIComponent(id)}`))
  } catch (error) {
    throw toReadableError(error, 'notification')
  }
}

export async function listAdminDeliveries(
  id: string,
  query: AdminListQuery,
): Promise<Paginated<AdminDelivery>> {
  try {
    return await get(
      generateApiParameters(
        `${BASE_URL}/${encodeURIComponent(id)}/deliveries?${toQueryString(query)}`,
      ),
    )
  } catch (error) {
    throw toReadableError(error, 'deliveries')
  }
}

function toReadableError(error: unknown, resource: string): Error {
  const status = (error as AxiosError).response?.status
  if (status === STATUS_CODES.Unauthorized || status === STATUS_CODES.Forbidden) {
    return new Error(`You do not have permission to view ${resource}`)
  }
  if (status === STATUS_CODES.NotFound) {
    return new Error(`The ${resource} could not be found`)
  }
  return new Error(`Failed to load ${resource}: ${getApiErrorMessage(error)}`)
}
