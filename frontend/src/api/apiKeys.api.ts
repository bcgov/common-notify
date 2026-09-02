import type { AxiosError } from 'axios'
import { get, patch, post, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { ApiKey, IssuedApiKey } from '@/interfaces/api-key.interface'

/**
 * API Keys API
 *
 * Self-service gateway credentials for the selected tenant. The backend asks the API
 * gateway's Credential Issuer for the credential and binds it to the tenant in the
 * same request, which is what removed the old manual steps in the API Services Portal.
 *
 * There is no revoke call: revoking happens on the API Services Portal, the only place
 * that actually stops the gateway honouring the key.
 */

const BASE_URL = '/api/v1/frontend/api-keys'

/** Keys bound to the selected tenant. Today there is at most one. */
export async function getApiKeys(): Promise<ApiKey[]> {
  try {
    const params = generateApiParameters(BASE_URL)
    return await get<ApiKey[]>(params)
  } catch (error) {
    throw toReadableError(error, 'load')
  }
}

/**
 * Issue a key for the selected tenant.
 * The returned value is the only copy — show it once, then it is gone.
 */
export async function issueApiKey(notes?: string): Promise<IssuedApiKey> {
  try {
    const params = generateApiParameters(BASE_URL)
    return await post<IssuedApiKey, { notes?: string }>({
      ...params,
      data: notes ? { notes } : {},
    })
  } catch (error) {
    throw toReadableError(error, 'generate')
  }
}

/**
 * Rotate the key's value. The clientId is unchanged, so usage history, limits and alert
 * configuration all survive; only the value the caller sends has to be swapped.
 */
export async function regenerateApiKey(clientId: string): Promise<IssuedApiKey> {
  try {
    const params = generateApiParameters(`${BASE_URL}/${encodeURIComponent(clientId)}/regenerate`)
    return await post<IssuedApiKey>({ ...params, data: {} })
  } catch (error) {
    throw toReadableError(error, 'regenerate')
  }
}

/** Set the free-text note recorded against a key. Pass null to clear it. */
export async function updateApiKeyNotes(clientId: string, notes: string | null): Promise<ApiKey> {
  try {
    const params = generateApiParameters(`${BASE_URL}/${encodeURIComponent(clientId)}`, { notes })
    return await patch<ApiKey, { notes: string | null }>(params)
  } catch (error) {
    throw toReadableError(error, 'save notes for')
  }
}

function toReadableError(error: unknown, verb: string): Error {
  const axiosError = error as AxiosError
  const responseData = (axiosError.response?.data as any) || {}
  const status = axiosError.response?.status

  if (status === STATUS_CODES.Unauthorized || status === STATUS_CODES.Forbidden) {
    return new Error('You do not have permission to manage API keys for this tenant')
  }
  // The gateway is a separate system with its own availability; say so rather than
  // implying the user did something wrong.
  if (status === STATUS_CODES.ServiceUnavailable) {
    return new Error(
      responseData.message || 'The API gateway is unavailable right now. Please try again shortly.',
    )
  }
  if (status === STATUS_CODES.Conflict) {
    return new Error(responseData.message || 'This tenant already has an API key')
  }

  return new Error(
    `Failed to ${verb} the API key: ${
      responseData.message || (error instanceof Error ? error.message : 'Unknown error')
    }`,
  )
}
