import type { FileAttachmentValue } from '../../../adapters/interfaces'

/**
 * Type guard to check if a value is a file attachment.
 * A valid file attachment must have 'file', 'filename', and 'sending_method' properties.
 *
 * @param v - The value to check
 * @returns true if v is a FileAttachmentValue, false otherwise
 */
export function isFileAttachment(v: unknown): v is FileAttachmentValue {
  return (
    typeof v === 'object' && v !== null && 'file' in v && 'filename' in v && 'sending_method' in v
  )
}

/**
 * Separates personalisation data into two categories:
 * 1. String values for template interpolation (e.g., name, email, boolean)
 * 2. File attachments that need to be processed separately
 *
 * This utility is essential because template engines (Handlebars, Mustache, EJS)
 * expect string values for variable substitution, but email payloads need to handle
 * file attachments separately. File data comes base64-encoded and must be converted
 * to Buffer objects before being added to the email.
 *
 * @param personalisation - Raw personalisation data with mixed string and file values
 * @returns An object with:
 *   - strings: All non-file personalisation values for template rendering
 *   - attachments: Processed file attachments ready for email sending
 *
 * @example
 * const data = {
 *   firstName: "John",
 *   receipt: {
 *     file: "base64pdf...",
 *     filename: "receipt.pdf",
 *     sending_method: "attach"
 *   }
 * };
 * const { strings, attachments } = splitPersonalisation(data);
 * // strings: { firstName: "John" }
 * // attachments: [{ filename: "receipt.pdf", content: Buffer(...), sendingMethod: "attach" }]
 */
export function splitPersonalisation(
  personalisation: Record<string, string | FileAttachmentValue>,
): {
  strings: Record<string, string>
  attachments: Array<{
    filename: string
    content: Buffer
    sendingMethod: 'attach' | 'link'
  }>
} {
  const strings: Record<string, string> = {}
  const attachments: Array<{
    filename: string
    content: Buffer
    sendingMethod: 'attach' | 'link'
  }> = []

  // Iterate through each personalisation entry
  for (const [key, value] of Object.entries(personalisation)) {
    if (isFileAttachment(value)) {
      // If it's a file attachment, convert base64 to Buffer and add to attachments
      attachments.push({
        filename: value.filename,
        content: Buffer.from(value.file, 'base64'),
        sendingMethod: value.sending_method,
      })
    } else {
      // Otherwise, add it to string values for template rendering
      strings[key] = value
    }
  }

  return { strings, attachments }
}
