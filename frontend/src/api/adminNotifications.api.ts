import { toReadableError } from '@/utils/apiErrorMessage'
import { get, generateApiParameters } from '@/common/api'
import type { PaginatedResponse } from '@/interfaces/PaginatedNotificationResponse'
import { toListQueryString } from './listQuery'
import type { ListQuery } from './listQuery'

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

/** A page of requests, newest first, filtered by tenant name, status, channel and date. */
export async function listAdminNotifications(
  query: ListQuery,
): Promise<PaginatedResponse<AdminNotificationRow>> {
  try {
    return await get(generateApiParameters(`${BASE_URL}?${toListQueryString(query)}`))
  } catch (error) {
    throw toReadableError(error, 'notifications')
  }
}

export async function getAdminNotification(id: string): Promise<AdminNotificationDetail> {
  try {
    return await get(generateApiParameters(`${BASE_URL}/${encodeURIComponent(id)}`))
  } catch (error) {
    throw toReadableError(error, 'notification', { notFound: true })
  }
}

export async function listAdminDeliveries(
  id: string,
  query: ListQuery,
): Promise<PaginatedResponse<AdminDelivery>> {
  try {
    return await get(
      generateApiParameters(
        `${BASE_URL}/${encodeURIComponent(id)}/deliveries?${toListQueryString(query)}`,
      ),
    )
  } catch (error) {
    throw toReadableError(error, 'deliveries')
  }
}
