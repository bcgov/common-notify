/**
 * Splits text into words and the punctuation around them, keeping both, so an address quoted as
 * <a@b.ca>, "a@b.ca" or a@b.ca: is a token of its own. One character class: linear, no backtracking.
 */
const TOKEN_BOUNDARY = /([\s<>()[\]{}"',;:]+)/
/** E.164 (+12505550123), and North American numbers written with separators (250-555-0123). */
const PHONE = /\+\d{10,15}\b|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g

/** Has a local part, an @, and a dot somewhere in the domain after it. */
function isEmail(token: string): boolean {
  const at = token.indexOf('@')
  return at > 0 && token.indexOf('.', at + 2) > at + 1
}

/** Each email address in the text, keeping a full stop that ends the sentence after it. */
function redactEmails(text: string): string {
  return text
    .split(TOKEN_BOUNDARY)
    .map((token) => {
      let end = token.length
      while (end > 0 && token[end - 1] === '.') end--
      return isEmail(token.slice(0, end)) ? `[email]${token.slice(end)}` : token
    })
    .join('')
}

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
  return redactEmails(redacted).replace(PHONE, '[phone]')
}

/** redactRecipients for a nullable jsonb value: objects are serialized first. */
export function redactValue(value: unknown, knownAddresses: string[] = []): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return redactRecipients(text, knownAddresses)
}
