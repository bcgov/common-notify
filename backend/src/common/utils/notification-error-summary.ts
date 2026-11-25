/** Safe display text only. Stored diagnostics and delivery retry decisions remain unchanged. */
export function notificationErrorSummary(error: string | null | undefined): string | undefined {
  if (!error?.trim()) return undefined

  // Older records contain JSON, plain provider messages, or both. Inspect only error fields;
  // never echo an unknown provider response (which may contain addresses or internal details).
  const parts: string[] = []
  const inspect = (value: unknown, depth = 0): void => {
    if (depth > 5 || value == null) return
    if (typeof value === 'string') {
      try {
        inspect(JSON.parse(value), depth + 1)
      } catch {
        parts.push(value)
      }
    } else if (Array.isArray(value)) {
      value.forEach((item) => inspect(item, depth + 1))
    } else if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      for (const key of [
        'message',
        'detail',
        'error',
        'errors',
        'code',
        'cause',
        'response',
        'data',
      ]) {
        inspect(record[key], depth + 1)
      }
      for (const key of ['status', 'statusCode', 'httpStatusCode']) {
        const status = Number(record[key])
        if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
          parts.push('service unavailable')
        }
      }
    }
  }
  inspect(error)
  const text = parts.join(' ')
  if (/\bsafelist(?:ed)?\b/i.test(text)) {
    return 'This recipient is not on the list of permitted recipients.'
  }
  if (/\bmissing personalisation\b/i.test(text)) {
    return 'Required template values are missing. Check the template and provide all required values.'
  }
  if (
    /\b(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ETIMEDOUT|ECONNRESET)\b|service unavailable|\b(?:upstream|returned HTTP) (?:408|429|5\d\d)\b|\b(?:timed? out|timeout|circuit.*open)\b/i.test(
      text,
    )
  ) {
    return 'A service we depend on was unavailable at this time.'
  }
  if (
    /\b(?:invalid (?:email|phone|recipient)|mailbox unavailable|unreachable destination handset)\b/i.test(
      text,
    )
  ) {
    return 'The notification could not be delivered to this recipient.'
  }
  return 'The notification could not be sent because an unexpected error occurred.'
}
