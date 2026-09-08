import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger'
import { NotificationTemplate } from './notification-template'
import { EmailContent } from './email-content'
import { SmsContent } from './sms-content'

export class NotificationResponse {
  @ApiProperty({
    description: 'Unique identifier for the notification',
    example: '740e5834-3a29-46b4-9a6f-16142fde533a',
    format: 'uuid',
  })
  id: string

  @ApiProperty({
    description: 'The reference supplied when sending, or null if none was given.',
    nullable: true,
    type: 'string',
    example: 'permit-BC-2026-00417',
  })
  reference: string | null

  @ApiProperty({
    description: 'Content of the notification',
    oneOf: [{ $ref: getSchemaPath(EmailContent) }, { $ref: getSchemaPath(SmsContent) }],
  })
  content: EmailContent | SmsContent

  @ApiProperty({
    description: 'URI to retrieve the notification',
    example: '/gcnotify/v2/notifications/740e5834-3a29-46b4-9a6f-16142fde533a',
    format: 'uri',
  })
  uri: string

  @ApiProperty({
    description: 'Template information',
  })
  template: NotificationTemplate

  @ApiPropertyOptional({
    description: 'When the notification is scheduled to be sent',
    format: 'date-time',
  })
  scheduled_for?: string
}
