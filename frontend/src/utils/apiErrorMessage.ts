import type { AxiosError } from 'axios'

/** The error body the backend returns: Nest's own shape, plus ValidationExceptionFilter's. */
interface ApiErrorBody {
  message?: string | string[]
  errors?: string[]
}

/**
 * The message the backend put in a failed response's body, or undefined when there is none.
 *
 * The backend ValidationExceptionFilter sets 'message' to the generic 'Validation failed' and puts the
 * a more detailed error in 'errors'. The generic message is displayed by default.
 */
export function getApiResponseMessage(
  err: unknown,
  { detailedErrors = false }: { detailedErrors?: boolean } = {},
): string | undefined {
  const data = (err as AxiosError<ApiErrorBody> | undefined)?.response?.data
  if (!data || typeof data !== 'object') return undefined

  // detailed error message
  const errors =
    Array.isArray(data.errors) && data.errors.length > 0 ? data.errors.join('; ') : undefined

  // generic error message, typically 'Validation failed', less intimidating for users
  const message = Array.isArray(data.message) ? data.message.join(', ') : data.message

  return (detailedErrors ? errors || message : message || errors) || undefined
}

/**
 * What to tell the user about a failed request: the backend's message, else the error's own
 * message, else the fallback.
 */
export function getApiErrorMessage(
  err: unknown,
  fallback = 'Unknown error',
  options?: { detailedErrors?: boolean },
): string {
  return getApiResponseMessage(err, options) || (err instanceof Error && err.message) || fallback
}

/**
 * A failed request as an error to show the user: a permission message for 401/403, otherwise
 * "Failed to load <resource>: <the backend's message>".
 *
 * @param options.notFound For a request for one record: report a 404 as "The <resource> could not
 *   be found". Off by default, because a 404 on a list is a missing route (the gateway's "no Route
 *   matched"), and that message is what tells you so.
 */
export function toReadableError(
  error: unknown,
  resource: string,
  options: { notFound?: boolean } = {},
): Error {
  // Status numbers, not common/api's STATUS_CODES: that module imports this one.
  const status = (error as AxiosError | undefined)?.response?.status
  if (status === 401 || status === 403) {
    return new Error(`You do not have permission to access ${resource}`)
  }
  if (status === 404 && options.notFound) {
    return new Error(`The ${resource} could not be found`)
  }
  return new Error(`Failed to load ${resource}: ${getApiErrorMessage(error)}`)
}
