import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TenantDto } from './tenant'

export class NotificationStatusCodeDto {
  @ApiProperty({ description: 'Status code identifier.', example: 'SENT' })
  code: string

  @ApiProperty({ description: 'Label suitable for display to a person.', example: 'Sent' })
  displayName: string

  @ApiPropertyOptional({
    description: 'What the status means.',
    example: 'The notification was handed to the delivery provider',
  })
  description?: string
}

export class NotificationRequestDto {
  @ApiProperty({
    description: 'The notifyId returned when the notification was accepted.',
    format: 'uuid',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  })
  id: string

  @ApiProperty({
    description: 'Tenant that submitted the request.',
    format: 'uuid',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  tenantId: string

  @ApiProperty({ type: TenantDto, description: 'Tenant information including name and slug' })
  tenant?: TenantDto

  @ApiProperty({
    type: NotificationStatusCodeDto,
    description: 'Processing status of the notification request, including code and display name',
  })
  status: NotificationStatusCodeDto

  @ApiPropertyOptional({
    description: 'Channels this request targeted',
    example: ['EMAIL', 'SMS'],
    isArray: true,
    enum: ['EMAIL', 'SMS', 'MSGAPP'],
  })
  channelCodes?: string[]

  @ApiPropertyOptional({
    description: 'API route that accepted the request',
    example: 'notifysimple/email',
  })
  requestRoute?: string

  @ApiPropertyOptional({
    description: 'Recipients by channel (email, sms, msgApp)',
    example: { email: ['test@example.com'], sms: ['+11234567890'], msgApp: ['user123'] },
  })
  recipients?: {
    email?: string[]
    sms?: string[]
    msgApp?: string[]
  }

  @ApiPropertyOptional({
    description: 'When a delayed notification is due to be sent.',
    format: 'date-time',
    example: '2026-06-01T16:00:00.000Z',
  })
  delayedSendTime?: Date

  @ApiPropertyOptional({
    description: 'The request body as submitted.',
    example: {
      email: {
        recipients: { to: ['citizen@example.com'] },
        content: {
          subject: 'Your permit application',
          body: 'Your application has been received.',
        },
      },
    },
  })
  payload?: any

  @ApiProperty({
    description: 'When the request was accepted.',
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
  })
  createdAt: Date

  @ApiPropertyOptional({ description: 'Who submitted the request.', example: 'permits-service' })
  createdBy?: string

  @ApiProperty({
    description: 'When the request last changed state.',
    format: 'date-time',
    example: '2026-05-15T10:00:04.512Z',
  })
  updatedAt: Date

  @ApiPropertyOptional({ description: 'Who last changed the request.', example: 'system' })
  updatedBy?: string

  @ApiPropertyOptional({
    description: 'Why the notification failed, when it did.',
    example: 'Recipient address rejected by the provider',
  })
  errorReason?: string
}
