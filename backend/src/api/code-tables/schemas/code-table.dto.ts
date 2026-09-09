import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

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
  @ApiProperty({
    description: 'The value used in requests and responses to refer to this entry.',
    example: 'SENT',
  })
  code: string

  @ApiProperty({ description: 'Label suitable for display to a person.', example: 'Sent' })
  displayName: string

  @ApiProperty({
    description: 'What this code means.',
    example: 'The notification was handed to the delivery provider',
  })
  description: string

  @ApiProperty({ format: 'date-time', example: '2026-01-04T18:22:11.000Z' })
  createdAt: Date

  @ApiPropertyOptional({ example: 'system' })
  createdBy?: string

  @ApiProperty({ format: 'date-time', example: '2026-01-04T18:22:11.000Z' })
  updatedAt: Date

  @ApiPropertyOptional({ example: 'system' })
  updatedBy?: string
}

/**
 * Response DTO for all code tables grouped by type
 */
export class CodeTablesResponseDto {
  @ApiProperty({
    type: [CodeTableDto],
    description: 'The statuses a notification can hold.',
  })
  statuses: CodeTableDto[]

  @ApiProperty({ type: [CodeTableDto], description: 'The channels a notification can be sent on.' })
  channels: CodeTableDto[]

  @ApiProperty({ type: [CodeTableDto], description: 'The event types a notification can carry.' })
  eventTypes: CodeTableDto[]

  /**
   * Feature flag codes (e.g., sms_notifications, sse_notifications)
   */
  featureFlags: CodeTableDto[]
}
