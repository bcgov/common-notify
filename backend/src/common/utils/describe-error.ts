/**
 * Text for an unknown thrown value, for a log line or an error message.
 *
 * String() on a plain object yields "[object Object]", which tells a reader nothing. JSON keeps
 * the contents visible, which is the whole point of logging the value.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error === undefined) return 'undefined'
  return JSON.stringify(error) ?? 'unknown error'
}
