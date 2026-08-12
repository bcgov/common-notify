import { EventStatus } from '../../../enum/event-status.enum'

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
   * Channels the event is configured on, from its channel settings.
   * Empty until a notification tab is configured.
   * @example ["EMAIL", "SMS"]
   */
  channelCodes: string[]

  /**
   * ACTIVE once any channel is switched on, DRAFT until then
   * @example "DRAFT"
   */
  status: EventStatus

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
