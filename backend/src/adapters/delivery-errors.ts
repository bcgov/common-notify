import { HttpException, HttpStatus } from '@nestjs/common'
import { describeError } from '../common/utils/describe-error'

/**
 * The provider could not take the message right now - it is down, restarting, overloaded or
 * rate limiting - and it accepted nothing. The message itself is fine: send it again later.
 *
 * Workers must not mark a recipient failed for this. A provider outage of a few seconds would
 * otherwise fail every recipient that reached it in those seconds, and since such errors come
 * back instantly, a large send would burn through its whole backlog. The work is left owed and
 * retried; the circuit breaker in front of the provider stops calls while it recovers.
 *
 * Not used when the outcome is unknown - a timeout after the request was sent may have been
 * delivered, and sending it again could deliver it twice.
 */
export class TransientDeliveryError extends HttpException {
  readonly transient = true

  constructor(message: string, status: number = HttpStatus.SERVICE_UNAVAILABLE) {
    super(message, status)
  }
}

export function isTransientDeliveryError(error: unknown): error is TransientDeliveryError {
  return error instanceof TransientDeliveryError
}

/** HTTP statuses that mean "not now" rather than "never": the request was not acted on. */
export function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/**
 * Network errors raised before a request reached the provider: nothing was sent. A connection
 * reset or a body cut off mid-response is not here - the provider may already have acted.
 */
const NOT_SENT_NETWORK_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH'])

/**
 * A network error raised before the request reached the provider. The code is on the error itself
 * (Azure SDK, axios) or on its `cause` (fetch's `TypeError('fetch failed')`).
 */
export function isNotSentNetworkError(error: unknown): boolean {
  const { code, cause } = (error ?? {}) as { code?: unknown; cause?: { code?: unknown } }
  return [code, cause?.code].some(
    (value) => typeof value === 'string' && NOT_SENT_NETWORK_CODES.has(value),
  )
}

/**
 * An SDK error from a provider, as a TransientDeliveryError when it means the provider took
 * nothing: an HTTP status of 408, 429 or 5xx (`statusCode` on Azure's RestError, `status` on
 * Twilio's RestException), or a network error before the request was sent. Null otherwise.
 */
export function transientFromProviderError(
  error: unknown,
  label: string,
): TransientDeliveryError | null {
  if (isTransientDeliveryError(error)) return error
  // Our own exceptions have a runtime `status` too; only a raw SDK error is classified here.
  if (error instanceof HttpException) return null
  const { statusCode, status, message } = (error ?? {}) as {
    statusCode?: unknown
    status?: unknown
    message?: unknown
  }
  const httpStatus = typeof statusCode === 'number' ? statusCode : status
  const text = typeof message === 'string' ? message : describeError(error)
  if (typeof httpStatus === 'number' && isTransientHttpStatus(httpStatus)) {
    return new TransientDeliveryError(`${label}: upstream ${httpStatus} - ${text}`, 502)
  }
  if (isNotSentNetworkError(error)) {
    return new TransientDeliveryError(`${label} unreachable: ${text}`)
  }
  return null
}
