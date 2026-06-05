/**
 * Data Transfer Object for Code Table Entries
 *
 * Represents the standard structure for all code table lookups:
 * - Notification Status Codes
 * - Notification Channel Codes
 * - Notification Event Type Codes
 * - Feature Flag Codes
 *
 * All code tables in the database follow this schema with fields:
 * - code: Unique identifier (primary key)
 * - displayName: Human-readable label for UI display
 * - description: Detailed explanation of the code
 * - createdAt: Timestamp when record was created
 * - createdBy: User/system that created the record
 * - updatedAt: Timestamp when record was last updated
 * - updatedBy: User/system that performed the last update
 */
export class CodeTableDto {
  /**
   * Unique code identifier (primary key)
   * Examples: 'SENT', 'EMAIL', 'PASSWORD_RESET', 'sms_notifications'
   */
  code: string

  /**
   * Human-readable display name for UI rendering
   * Examples: 'Sent', 'Email', 'Password Reset', 'SMS Notifications'
   */
  displayName: string

  /**
   * Detailed description of what this code represents
   * Examples: 'Notification has been sent', 'Email channel for notifications'
   */
  description: string

  /**
   * Timestamp when the record was created
   */
  createdAt: Date

  /**
   * User or system that created this record (optional)
   */
  createdBy?: string

  /**
   * Timestamp when the record was last updated
   */
  updatedAt: Date

  /**
   * User or system that performed the last update (optional)
   */
  updatedBy?: string
}

/**
 * Response DTO for all code tables grouped by type
 */
export class CodeTablesResponseDto {
  /**
   * Notification status codes (e.g., SENT, FAILED, PENDING, QUEUED)
   */
  statuses: CodeTableDto[]

  /**
   * Notification delivery channel codes (e.g., EMAIL, SMS, MSGAPP)
   */
  channels: CodeTableDto[]

  /**
   * Notification event type codes (e.g., PASSWORD_RESET, INVOICE_SENT)
   */
  eventTypes: CodeTableDto[]

  /**
   * Feature flag codes (e.g., sms_notifications, sse_notifications)
   */
  featureFlags: CodeTableDto[]
}
