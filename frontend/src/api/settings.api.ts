import type { AxiosError } from 'axios'
import { get, patch, generateApiParameters, STATUS_CODES } from '@/common/api'
import type {
  EmailSettingsValues,
  SmsSettingsValues,
  TenantSettings,
  TenantSettingsValues,
} from '@/interfaces/tenant-settings.interface'

/**
 * Tenant Settings API
 *
 * Frontend-facing endpoints for the authenticated tenant's settings.
 *
 * One GET returns the whole row and every settings tab reads from it.
 * Writes stay per-tab so each PATCH only touches its own columns.
 */

const BASE_URL = '/api/v1/frontend/tenant-settings'

/**
 * Get every settings value for the selected tenant.
 * Returns null when no settings row exists yet; callers fall back to defaults.
 */
export async function getSettings(): Promise<TenantSettings | null> {
  try {
    const params = generateApiParameters(BASE_URL)
    return await get<TenantSettings | null>(params)
  } catch (error) {
    throw toReadableError(error, 'settings', 'load')
  }
}

/**
 * Update the Tenant tab fields. Requires NOTIFY_OPERATIONS_ADMIN.
 * Returns the refreshed row.
 */
export async function updateTenantSettings(data: TenantSettingsValues): Promise<TenantSettings> {
  try {
    const params = generateApiParameters(`${BASE_URL}/tenant`, data)
    return await patch<TenantSettings, TenantSettingsValues>(params)
  } catch (error) {
    throw toReadableError(error, 'tenant settings', 'update')
  }
}

/**
 * Update the Email tab fields. Requires NOTIFY_OPERATIONS_ADMIN.
 * Returns the refreshed row.
 */
export async function updateEmailSettings(data: EmailSettingsValues): Promise<TenantSettings> {
  try {
    const params = generateApiParameters(`${BASE_URL}/email`, data)
    return await patch<TenantSettings, EmailSettingsValues>(params)
  } catch (error) {
    throw toReadableError(error, 'email settings', 'update')
  }
}

/**
 * Update the SMS tab fields. Requires NOTIFY_OPERATIONS_ADMIN.
 * Returns the refreshed row.
 */
export async function updateSmsSettings(data: SmsSettingsValues): Promise<TenantSettings> {
  try {
    const params = generateApiParameters(`${BASE_URL}/sms`, data)
    return await patch<TenantSettings, SmsSettingsValues>(params)
  } catch (error) {
    throw toReadableError(error, 'SMS settings', 'update')
  }
}

function toReadableError(error: unknown, resource: string, verb: 'load' | 'update'): Error {
  const axiosError = error as AxiosError
  const responseData = (axiosError.response?.data as any) || {}

  if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
    return new Error(`You are not authorized to view ${resource}`)
  }
  if (axiosError.response?.status === STATUS_CODES.Forbidden) {
    return new Error(`You do not have permission to modify the ${resource}`)
  }

  return new Error(
    `Failed to ${verb} ${resource}: ${
      responseData.message || (error instanceof Error ? error.message : 'Unknown error')
    }`,
  )
}
