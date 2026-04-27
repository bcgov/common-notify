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

  @ApiProperty({
    enum: [
      NotificationStatus.PENDING,
      NotificationStatus.ACCEPTED,
      NotificationStatus.QUEUED,
      NotificationStatus.SCHEDULED,
    ],
    description:
      'Current status: ACCEPTED if request is acknowledged, SCHEDULED if request is accepted and scheduled for future processing, QUEUED if immediately added to queue, PENDING if queued to retry job',
  })
  status: NotificationStatus

  @ApiProperty({
    type: 'array',
    items: { type: 'string', enum: ['email', 'sms', 'msgApp'] },
    description: 'Channels that will be used to send the notification',
  })
  channels: string[]

  @ApiProperty({
    description: 'Timestamp when the notification was created',
    format: 'date-time',
  })
  createdAt: Date

  @ApiProperty({
    description: 'Human-readable status message',
  })
  message: string
}
