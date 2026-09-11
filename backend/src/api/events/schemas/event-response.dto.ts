import { EventStatus } from '../../../enum/event-status.enum'

/**
 * The event's EMAIL channel settings, backing the Email Notification tab
 */
export class EventEmailSettingsDto {
  /**
   * Whether the event sends on the email channel
   * @example false
   */
  active: boolean

  /**
   * From address for email sends. Null until the tab has a sender email saved.
   * @example "no-reply@gov.bc.ca"
   */
  senderEmail: string | null

  /**
   * Template used to render this channel. Null until the tab has a template saved.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  templateId: string | null

  /**
   * Primary recipients for this channel. Empty until the tab has recipients saved.
   * @example ["alice@example.com"]
   */
  to: string[]

  /**
   * CC recipients for this channel.
   * @example ["bob@example.com"]
   */
  cc: string[]

  /**
   * BCC recipients for this channel.
   * @example ["carol@example.com"]
   */
  bcc: string[]

  /**
   * Whether the email uses a custom header rather than the tenant's default one
   * @example false
   */
  useCustomHeader: boolean

  /**
   * Approved email logo shown in the custom header. Null when there is no custom header, or when
   * the custom header has no logo.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  headerLogoId: string | null

  /**
   * Title text shown beside the logo in the custom header. Null when there is no custom header,
   * or when the custom header has no title.
   * @example "Ministry of Education"
   */
  headerTitle: string | null
}

/**
 * The event's SMS channel settings, backing the SMS Notification tab
 */
export class EventSmsSettingsDto {
  /**
   * Whether the event sends on the SMS channel
   * @example false
   */
  active: boolean

  /**
   * Template used to render this channel. Null until the tab has a template saved.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  templateId: string | null

  /**
   * Primary recipients for this channel. Empty until the tab has recipients saved.
   * @example ["+12505551234"]
   */
  to: string[]
}

/**
 * DTO for event responses from the API
 */
export class EventResponseDto {
  /**
   * Event ID (UUID)
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  id: string

  /**
   * Event name
   * @example "Graduates Outcome Survey"
   */
  name: string

  /**
   * Description of what the event is for. Empty string when unset.
   * @example "Sent to graduates six months after program completion"
   */
  description: string

  /**
   * Channels switched on for the event, from its channel settings.
   * Excludes channels that are switched off.
   * @example ["EMAIL", "SMS"]
   */
  channelCodes: string[]

  /**
   * ACTIVE once any channel is switched on, DRAFT until then
   * @example "DRAFT"
   */
  status: EventStatus

  /**
   * EMAIL channel settings, or null until the Email Notification tab is first saved
   */
  emailSettings: EventEmailSettingsDto | null

  /**
   * SMS channel settings, or null until the SMS Notification tab is first saved
   */
  smsSettings: EventSmsSettingsDto | null

  /**
   * Timestamp when the event was created
   * @example "2024-05-01T12:00:00Z"
   */
  createdAt: Date

  /**
   * Timestamp when the event was last updated
   * @example "2024-05-01T12:30:00Z"
   */
  updatedAt: Date
}
