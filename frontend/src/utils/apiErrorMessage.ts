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
