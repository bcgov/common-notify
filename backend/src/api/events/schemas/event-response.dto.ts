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
   * From address for email sends. Null while the tab is still a draft.
   * @example "no-reply@gov.bc.ca"
   */
  senderEmail: string | null
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
   * Channels the event actively sends on, from its channel settings.
   * Excludes channels that are configured but switched off.
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
