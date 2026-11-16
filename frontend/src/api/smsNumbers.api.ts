import { get, post, put, patch, deleteMethod, generateApiParameters } from '@/common/api'
import { getApiErrorMessage, toReadableError } from '@/utils/apiErrorMessage'

/**
 * SMS numbers: the admin inventory and assignments (/api/v1/frontend/admin/sms-numbers,
 * NOTIFY_ADMIN), and a tenant's own request for a number (/api/v1/frontend/sms-number-requests,
 * tenant-scoped by the X-Tenant-ID header).
 */

const ADMIN_URL = '/api/v1/frontend/admin/sms-numbers'
const REQUESTS_URL = '/api/v1/frontend/sms-number-requests'

export type SmsNumberRequestStatus = 'pending' | 'approved' | 'rejected' | 'released' | 'cancelled'

export interface SmsNumberTenant {
  tenantId: string
  tenantName: string
}

export interface SmsNumber {
  id: string
  /** E.164, or a 5-6 digit short code. */
  phoneNumber: string
  providerCode: string
  numberTypeCode: string
  /** The provider's own id for the number, for finding it in their console. */
  providerReference: string | null
  description: string | null
  /** What a tenant without a number of its own sends from, through this number's provider. */
  isDefault: boolean
  tenants: SmsNumberTenant[]
}

export interface SmsNumberInput {
  phoneNumber: string
  providerCode: string
  numberTypeCode: string
  providerReference?: string | null
  description?: string | null
}

export type SmsNumberUpdate = Partial<
  Pick<SmsNumberInput, 'numberTypeCode' | 'providerReference' | 'description'>
>

export interface SmsNumberRequest {
  id: string
  tenantId: string
  tenantName: string
  statusCode: SmsNumberRequestStatus
  requestedBy: string | null
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  /** Why it was rejected. */
  decisionReason: string | null
  /** The number assigned on approval. */
  phoneNumber: string | null
  /** Approved on the service-wide default number rather than one of its own (non-prod only). */
  usesDefaultNumber: boolean
  /** Who released the number, and when: an admin, the tenant, or an admin reassigning it. */
  releasedBy: string | null
  releasedAt: string | null
  /** Who cancelled the request while it was pending, and when. */
  cancelledBy: string | null
  cancelledAt: string | null
}

export interface SmsCode {
  code: string
  description: string
}

export interface SmsNumberCodes {
  providers: SmsCode[]
  numberTypes: SmsCode[]
  requestStatuses: SmsCode[]
  /** The provider SMS is sending through now. */
  activeProvider: string
  /** What a tenant without a number of its own sends from now: the active provider's default. */
  defaultNumber: string | null
  /** Whether a request can be approved on the default number: every environment but prod. */
  defaultNumberAssignable: boolean
}

/** A failed change, with the backend's reason (a conflict, a validation message). */
const failed = (action: string, error: unknown) =>
  new Error(`Failed to ${action}: ${getApiErrorMessage(error)}`)

// --- Admin -------------------------------------------------------------------------------------

export async function getSmsNumbers(): Promise<SmsNumber[]> {
  try {
    return await get<SmsNumber[]>(generateApiParameters(ADMIN_URL))
  } catch (error) {
    throw toReadableError(error, 'SMS numbers')
  }
}

export async function getSmsNumberCodes(): Promise<SmsNumberCodes> {
  try {
    return await get<SmsNumberCodes>(generateApiParameters(`${ADMIN_URL}/codes`))
  } catch (error) {
    throw toReadableError(error, 'SMS number options')
  }
}

export async function createSmsNumber(data: SmsNumberInput): Promise<SmsNumber> {
  try {
    return await post<SmsNumber>({ ...generateApiParameters(ADMIN_URL), data })
  } catch (error) {
    throw failed('add the number', error)
  }
}

export async function updateSmsNumber(id: string, data: SmsNumberUpdate): Promise<SmsNumber> {
  try {
    return await patch<SmsNumber>(
      generateApiParameters(`${ADMIN_URL}/${encodeURIComponent(id)}`, data),
    )
  } catch (error) {
    throw failed('update the number', error)
  }
}

export async function deleteSmsNumber(id: string): Promise<void> {
  try {
    await deleteMethod<void>(generateApiParameters(`${ADMIN_URL}/${encodeURIComponent(id)}`))
  } catch (error) {
    throw failed('remove the number', error)
  }
}

/** Makes a number its provider's default, replacing the previous one. */
export async function setDefaultSmsNumber(id: string): Promise<SmsNumber> {
  try {
    return await put<SmsNumber>(
      generateApiParameters(`${ADMIN_URL}/${encodeURIComponent(id)}/default`, {}),
    )
  } catch (error) {
    throw failed('make the number the default', error)
  }
}

/** Stops using a number as its provider's default. */
export async function clearDefaultSmsNumber(id: string): Promise<void> {
  try {
    await deleteMethod<void>(
      generateApiParameters(`${ADMIN_URL}/${encodeURIComponent(id)}/default`),
    )
  } catch (error) {
    throw failed('stop using the number as the default', error)
  }
}

/** Assigns a tenant a number, replacing its number for that number's provider. */
export async function assignSmsNumber(tenantId: string, smsNumberId: string): Promise<void> {
  try {
    await put<void>(
      generateApiParameters(`${ADMIN_URL}/tenants/${encodeURIComponent(tenantId)}`, {
        smsNumberId,
      }),
    )
  } catch (error) {
    throw failed('assign the number', error)
  }
}

export async function unassignSmsNumber(tenantId: string, smsNumberId: string): Promise<void> {
  try {
    await deleteMethod<void>(
      generateApiParameters(
        `${ADMIN_URL}/tenants/${encodeURIComponent(tenantId)}/${encodeURIComponent(smsNumberId)}`,
      ),
    )
  } catch (error) {
    throw failed('unassign the number', error)
  }
}

export async function getSmsNumberRequests(
  status?: SmsNumberRequestStatus,
): Promise<SmsNumberRequest[]> {
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : ''
    return await get<SmsNumberRequest[]>(generateApiParameters(`${ADMIN_URL}/requests${query}`))
  } catch (error) {
    throw toReadableError(error, 'SMS number requests')
  }
}

/**
 * Approves a request by assigning the tenant the number, or with null, on the default number
 * (non-prod only).
 */
export async function approveSmsNumberRequest(
  requestId: string,
  smsNumberId: string | null,
): Promise<SmsNumberRequest> {
  try {
    return await post<SmsNumberRequest>({
      ...generateApiParameters(`${ADMIN_URL}/requests/${encodeURIComponent(requestId)}/approve`),
      data: smsNumberId === null ? { useDefaultNumber: true } : { smsNumberId },
    })
  } catch (error) {
    throw failed('approve the request', error)
  }
}

/** Releases the number an approved request assigned its tenant. */
export async function releaseSmsNumberRequest(requestId: string): Promise<SmsNumberRequest> {
  try {
    return await post<SmsNumberRequest>({
      ...generateApiParameters(`${ADMIN_URL}/requests/${encodeURIComponent(requestId)}/release`),
      data: {},
    })
  } catch (error) {
    throw failed('release the number', error)
  }
}

export async function rejectSmsNumberRequest(
  requestId: string,
  reason: string,
): Promise<SmsNumberRequest> {
  try {
    return await post<SmsNumberRequest>({
      ...generateApiParameters(`${ADMIN_URL}/requests/${encodeURIComponent(requestId)}/reject`),
      data: { reason },
    })
  } catch (error) {
    throw failed('reject the request', error)
  }
}

// --- Tenant ------------------------------------------------------------------------------------

/** The selected tenant's latest request, or null if it has never asked for a number. */
export async function getMySmsNumberRequest(): Promise<SmsNumberRequest | null> {
  try {
    const { request } = await get<{ request: SmsNumberRequest | null }>(
      generateApiParameters(REQUESTS_URL),
    )
    return request
  } catch (error) {
    throw toReadableError(error, 'SMS number request')
  }
}

export async function requestSmsNumber(): Promise<SmsNumberRequest> {
  try {
    return await post<SmsNumberRequest>({ ...generateApiParameters(REQUESTS_URL), data: {} })
  } catch (error) {
    throw failed('request an SMS number', error)
  }
}

/** Cancels the selected tenant's pending request. */
export async function cancelMySmsNumberRequest(requestId: string): Promise<SmsNumberRequest> {
  try {
    return await post<SmsNumberRequest>({
      ...generateApiParameters(`${REQUESTS_URL}/${encodeURIComponent(requestId)}/cancel`),
      data: {},
    })
  } catch (error) {
    throw failed('cancel the request', error)
  }
}

/** Releases the number the selected tenant's approved request assigned it. */
export async function releaseMySmsNumber(requestId: string): Promise<SmsNumberRequest> {
  try {
    return await post<SmsNumberRequest>({
      ...generateApiParameters(`${REQUESTS_URL}/${encodeURIComponent(requestId)}/release`),
      data: {},
    })
  } catch (error) {
    throw failed('release the number', error)
  }
}
