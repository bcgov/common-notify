import { get, post, generateApiParameters } from '@/common/api'
import { getApiErrorMessage, toReadableError } from '@/utils/apiErrorMessage'
import type { PaginatedResponse } from '@/interfaces/PaginatedNotificationResponse'
import { toListQueryString } from './listQuery'
import type { ListQuery } from './listQuery'

/**
 * Tenant requests: things tenants ask Notify admins for, such as an SMS number, and the admins'
 * decisions (/api/v1/frontend/admin/tenant-requests, NOTIFY_ADMIN). Each type of request is asked
 * for from its own settings; see smsNumbers.api for an SMS number.
 */

const ADMIN_URL = '/api/v1/frontend/admin/tenant-requests'

export type TenantRequestStatus = 'pending' | 'approved' | 'rejected' | 'released' | 'cancelled'

export interface TenantRequest {
  id: string
  tenantId: string
  tenantName: string
  /** What is being asked for, e.g. `sms_number`. */
  requestTypeCode: string
  statusCode: TenantRequestStatus
  requestedBy: string | null
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  /** Why it was rejected. */
  decisionReason: string | null
  /** What approval granted, e.g. the number assigned. Null until approved. */
  outcome: string | null
  /** Who took back what was granted, and when: an admin or the tenant. */
  releasedBy: string | null
  releasedAt: string | null
  /** Who cancelled the request while it was pending, and when. */
  cancelledBy: string | null
  cancelledAt: string | null
}

export interface TenantRequestCode {
  code: string
  description: string
}

export interface TenantRequestCodes {
  /** The request types Notify can approve. */
  types: TenantRequestCode[]
  statuses: TenantRequestCode[]
}

/** A failed change, with the backend's reason (a conflict, a validation message). */
const failed = (action: string, error: unknown) =>
  new Error(`Failed to ${action}: ${getApiErrorMessage(error)}`)

/**
 * A page of requests, newest first. Filter with `statusCode:in:pending|approved` and
 * `requestTypeCode:in:sms_number`; `search` matches tenant names.
 */
export async function getTenantRequests(
  query: ListQuery = {},
): Promise<PaginatedResponse<TenantRequest>> {
  try {
    return await get<PaginatedResponse<TenantRequest>>(
      generateApiParameters(`${ADMIN_URL}?${toListQueryString(query)}`),
    )
  } catch (error) {
    throw toReadableError(error, 'tenant requests')
  }
}

export async function getTenantRequestCodes(): Promise<TenantRequestCodes> {
  try {
    return await get<TenantRequestCodes>(generateApiParameters(`${ADMIN_URL}/codes`))
  } catch (error) {
    throw toReadableError(error, 'request types')
  }
}

/** Approves a request. What `options` holds depends on its type, e.g. `{ smsNumberId }`. */
export async function approveTenantRequest(
  requestId: string,
  options: Record<string, unknown> = {},
): Promise<TenantRequest> {
  try {
    return await post<TenantRequest>({
      ...generateApiParameters(`${ADMIN_URL}/${encodeURIComponent(requestId)}/approve`),
      data: { options },
    })
  } catch (error) {
    throw failed('approve the request', error)
  }
}

export async function rejectTenantRequest(
  requestId: string,
  reason: string,
): Promise<TenantRequest> {
  try {
    return await post<TenantRequest>({
      ...generateApiParameters(`${ADMIN_URL}/${encodeURIComponent(requestId)}/reject`),
      data: { reason },
    })
  } catch (error) {
    throw failed('reject the request', error)
  }
}

/** Takes back what an approved request granted. */
export async function releaseTenantRequest(requestId: string): Promise<TenantRequest> {
  try {
    return await post<TenantRequest>({
      ...generateApiParameters(`${ADMIN_URL}/${encodeURIComponent(requestId)}/release`),
      data: {},
    })
  } catch (error) {
    throw failed('release the request', error)
  }
}
