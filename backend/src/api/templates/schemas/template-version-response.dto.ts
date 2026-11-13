/**
 * A historical version of a template, as it read when that version was made
 */
export class TemplateVersionResponseDto {
  /**
   * Version number
   * @example 2
   */
  version: number

  /**
   * Template name at this version
   * @example "New Order Ready"
   */
  name: string

  /**
   * Email subject at this version (for email templates)
   * @example "Your order is ready"
   */
  subject?: string

  /**
   * Template body at this version, before personalisation is applied
   * @example "Hello {{firstName}}"
   */
  body: string

  /**
   * Display name of the user who made this version, if one was recorded
   * @example "Barrett Falk"
   */
  createdByName?: string | null

  /**
   * Timestamp when this version was made
   * @example "2026-06-12T12:00:00Z"
   */
  createdAt: Date
}
