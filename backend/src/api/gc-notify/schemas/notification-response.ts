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

  @ApiPropertyOptional({
    description: 'Reference identifier provided when creating the notification',
  })
  reference?: string

  @ApiProperty({
    description: 'Content of the notification',
    oneOf: [{ $ref: getSchemaPath(EmailContent) }, { $ref: getSchemaPath(SmsContent) }],
  })
  content: EmailContent | SmsContent

  @ApiProperty({
    description: 'URI to retrieve the notification',
    example: '/api/gcnotify/v2/notifications/740e5834-3a29-46b4-9a6f-16142fde533a',
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
