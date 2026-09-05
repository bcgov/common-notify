import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationTemplate } from './notification-template'

export class Notification {
  @ApiProperty({
    description: 'Notification ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  id: string

  @ApiPropertyOptional({
    description: 'The reference supplied when the notification was sent.',
    example: 'permit-BC-2026-00417',
  })
  reference?: string

  @ApiPropertyOptional({
    description: 'Recipient address, for an email notification.',
    format: 'email',
    example: 'citizen@example.com',
  })
  email_address?: string

  @ApiPropertyOptional({
    description: 'Recipient number, for an SMS notification.',
    example: '+12505550123',
  })
  phone_number?: string

  @ApiPropertyOptional()
  line_1?: string

  @ApiPropertyOptional()
  line_2?: string

  @ApiPropertyOptional()
  line_3?: string

  @ApiPropertyOptional()
  line_4?: string

  @ApiPropertyOptional()
  line_5?: string

  @ApiPropertyOptional()
  line_6?: string

  @ApiPropertyOptional()
  postcode?: string

  @ApiProperty({
    description: 'The channel this notification was sent on.',
    enum: ['sms', 'email'],
    example: 'email',
  })
  type: 'sms' | 'email'

  @ApiProperty({
    description: 'Notification status',
    enum: [
      'created',
      'sending',
      'pending',
      'delivered',
      'permanent-failure',
      'temporary-failure',
      'technical-failure',
      'pending-virus-check',
      'virus-scan-failed',
    ],
    example: 'delivered',
  })
  status: string

  @ApiPropertyOptional({
    description: 'Human-readable form of the status.',
    example: 'Delivered',
  })
  status_description?: string

  @ApiPropertyOptional({
    description: 'What the delivery provider reported, when it reported anything.',
    example: 'Message accepted by recipient server',
  })
  provider_response?: string

  @ApiProperty({ description: 'Template information' })
  template: NotificationTemplate

  @ApiProperty({
    description: 'The rendered message that was sent.',
    example: 'Hello Alice, permit BC-2026-00417 has been approved.',
  })
  body: string

  @ApiPropertyOptional({
    description: 'The rendered subject line. Email only.',
    example: 'Permit BC-2026-00417 approved',
  })
  subject?: string

  @ApiProperty({
    description: 'When the notification was accepted.',
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
  })
  created_at: string

  @ApiPropertyOptional({ description: 'Who submitted it.', example: 'permits-service' })
  created_by_name?: string

  @ApiPropertyOptional({
    description: 'When it was handed to the delivery provider.',
    format: 'date-time',
    example: '2026-05-15T10:00:04.512Z',
  })
  sent_at?: string

  @ApiPropertyOptional({
    description: 'When delivery finished, successfully or not.',
    format: 'date-time',
    example: '2026-05-15T10:00:07.004Z',
  })
  completed_at?: string

  @ApiPropertyOptional({
    description: 'When a delayed notification is due to be sent.',
    format: 'date-time',
    example: '2026-06-01T16:00:00.000Z',
  })
  scheduled_for?: string

  @ApiPropertyOptional()
  postage?: string
}
