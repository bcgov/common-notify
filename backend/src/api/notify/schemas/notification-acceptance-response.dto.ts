import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationStatus } from '../../../enum/notification-status.enum'

/**
 * Response when a notification request is accepted for processing.
 * Always returns HTTP 202 Accepted, indicating the request has been acknowledged
 * but may not yet be queued (e.g., if Redis is unavailable, it will remain PENDING
 * until the scheduled retry job processes it).
 */
export class NotificationAcceptanceResponse {
  @ApiProperty({
    format: 'uuid',
    description: 'Identifier for this request. Use it to look the notification up later.',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  })
  notifyId: string

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The template used, if the notification referenced one.',
    example: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33',
  })
  templateId?: string

  @ApiProperty({
    enum: [
      NotificationStatus.PENDING,
      NotificationStatus.ACCEPTED,
      NotificationStatus.QUEUED,
      NotificationStatus.SCHEDULED,
    ],
    description:
      'ACCEPTED once acknowledged, QUEUED once handed to the delivery queue, SCHEDULED when ' +
      'delayedSend is in the future, PENDING when acknowledged but not yet queued.',
    example: 'QUEUED',
  })
  status: NotificationStatus

  @ApiProperty({
    type: 'array',
    items: { type: 'string', enum: ['email', 'sms', 'msgApp'] },
    description: 'The channels this notification will be delivered on.',
    example: ['email'],
  })
  channels: string[]

  @ApiProperty({
    description: 'When the request was accepted.',
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
  })
  createdAt: Date

  @ApiProperty({
    description: 'Human-readable summary of what was accepted.',
    example: 'Notification accepted for delivery',
  })
  message: string

  @ApiPropertyOptional({
    description:
      'Mail merge only: how many recipients were accepted, excluding any dropped by the safelist.',
    example: 2,
  })
  recipientCount?: number

  @ApiPropertyOptional({
    description:
      'Mail merge only: how many distinct recipients were dropped because they are not on the ' +
      'tenant safelist. Omitted when none were dropped.',
    example: 1,
  })
  blockedRecipientCount?: number

  @ApiPropertyOptional({
    description: 'Mail merge only: explains which recipients were dropped and why.',
    example: '1 recipient was not on the safelist and was not sent to.',
  })
  blockedMessage?: string
}
