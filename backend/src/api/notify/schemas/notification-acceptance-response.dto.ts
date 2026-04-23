import { ApiProperty } from '@nestjs/swagger'
import { NotificationStatus } from '../../../enum/notification-status.enum'

/**
 * Response when a notification request is accepted for processing.
 * Always returns HTTP 202 Accepted, indicating the request has been acknowledged
 * but may not yet be queued (e.g., if Redis is unavailable, it will remain PENDING
 * until the scheduled retry job processes it).
 */
export class NotificationAcceptanceResponse {
  @ApiProperty({ format: 'uuid', description: 'Unique notification request ID' })
  notifyId: string

  @ApiProperty({ format: 'uuid', description: 'Internal record ID for tracking' })
  recordId: string

  @ApiProperty({
    enum: [NotificationStatus.PENDING, NotificationStatus.QUEUED],
    description:
      'Current status: QUEUED if immediately added to queue, PENDING if queued to retry job',
  })
  status: NotificationStatus

  @ApiProperty({
    description: 'Human-readable status message',
  })
  message: string
}
