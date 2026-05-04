import { NotificationChannel } from '../../../enum/notification-channel.enum'
import { TemplateEngine } from '../../../enum/template-engine.enum'

/**
 * DTO for template responses from the API
 */
export class TemplateResponseDto {
  /**
   * Template ID (UUID)
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  id: string

  /**
   * Template name
   * @example "Funding Approved Email"
   */
  name: string

  /**
   * Optional description
   * @example "Email sent to applicants when funding is approved"
   */
  description?: string

  /**
   * Notification channel type
   * @example "email"
   */
  channelCode: NotificationChannel

  /**
   * Email subject (for email templates)
   * @example "Your funding has been approved"
   */
  subject?: string

  /**
   * Template body with placeholders
   * @example "Dear {{firstName}} {{lastName}}, your funding of ${{amount}} has been approved."
   */
  body: string

  /**
   * Template rendering engine
   * @example "handlebars"
   */
  engineCode: TemplateEngine

  /**
   * Current version number
   * @example 1
   */
  version: number

  /**
   * Whether this is the active version
   * @example true
   */
  active: boolean

  /**
   * User who created this template
   * @example "user@example.com"
   */
  createdBy: string

  /**
   * Timestamp when template was created
   * @example "2024-05-01T12:00:00Z"
   */
  createdAt: Date

  /**
   * User who last updated this template
   * @example "user@example.com"
   */
  updatedBy: string

  /**
   * Timestamp when template was last updated
   * @example "2024-05-01T12:30:00Z"
   */
  updatedAt: Date
}
