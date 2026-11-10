const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
/** E.164 (+12505550123), and North American numbers written with separators (250-555-0123). */
const PHONE = /\+\d{10,15}\b|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

/**
 * Strips recipient addresses from provider and worker error text, so admins can read an error
 * without seeing who it was sent to. Known addresses are replaced first, so one the patterns
 * would miss, such as an unformatted local number, is still hidden.
 */
export function redactRecipients(text: string, knownAddresses: string[] = []): string {
  let redacted = text
  for (const address of knownAddresses) {
    if (address) {
      redacted = redacted.replace(new RegExp(escapeRegExp(address), 'gi'), '[recipient]')
    }
  }
  return redacted.replace(EMAIL, '[email]').replace(PHONE, '[phone]')
}

/** redactRecipients for a nullable jsonb value: objects are serialized first. */
export function redactValue(value: unknown, knownAddresses: string[] = []): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return redactRecipients(text, knownAddresses)
}
