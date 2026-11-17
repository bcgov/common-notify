import { get, post, put, patch, deleteMethod, generateApiParameters } from '@/common/api'
import { getApiErrorMessage, toReadableError } from '@/utils/apiErrorMessage'
import type { TenantRequest } from './tenantRequests.api'

/**
 * SMS numbers: the admin inventory and assignments (/api/v1/frontend/admin/sms-numbers,
 * NOTIFY_ADMIN), and a tenant's own request for a number (/api/v1/frontend/sms-number-requests,
 * tenant-scoped by the X-Tenant-ID header). Admins decide requests through tenantRequests.api.
 */

const ADMIN_URL = '/api/v1/frontend/admin/sms-numbers'
const REQUESTS_URL = '/api/v1/frontend/sms-number-requests'

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
  description: string | null
  /** What a tenant without a number of its own sends from, through this number's provider. */
  isDefault: boolean
  tenants: SmsNumberTenant[]
}

export interface SmsNumberInput {
  phoneNumber: string
  providerCode: string
  numberTypeCode: string
  description?: string | null
}

export type SmsNumberUpdate = Partial<Pick<SmsNumberInput, 'numberTypeCode' | 'description'>>

/** A tenant's request for an SMS number, as its SMS settings show it. */
export interface SmsNumberRequest extends TenantRequest {
  /** The number assigned on approval. */
  phoneNumber: string | null
  /** Approved on the service-wide default number rather than one of its own (non-prod only). */
  usesDefaultNumber: boolean
}

export interface SmsCode {
  code: string
  description: string
}

export interface SmsNumberCodes {
  providers: SmsCode[]
  numberTypes: SmsCode[]
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

// --- Tenant ------------------------------------------------------------------------------------

/** Where the selected tenant's SMS number stands. */
export interface MySmsNumberStatus {
  /** Its latest request, or null if it has never asked for a number. */
  request: SmsNumberRequest | null
  /** The number its SMS goes out from now: its own, else the shared default. */
  senderNumber: string | null
  /** Dev, test or a PR environment, where tenants normally share the default number. */
  testEnvironment: boolean
}

export async function getMySmsNumberRequest(): Promise<MySmsNumberStatus> {
  try {
    return await get<MySmsNumberStatus>(generateApiParameters(REQUESTS_URL))
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
