import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TenantDto } from './tenant'

export class NotificationStatusCodeDto {
  @ApiProperty({ description: 'Status code identifier' })
  code: string

  @ApiProperty({ description: 'Display name for the status' })
  displayName: string

  @ApiPropertyOptional({ description: 'Description of the status' })
  description?: string
}

export class NotificationRequestDto {
  @ApiProperty({ description: 'Unique identifier for the notification request', format: 'uuid' })
  id: string

  @ApiProperty({ description: 'Tenant that submitted the request', format: 'uuid' })
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
    description: 'Scheduled send time for delayed notifications',
    format: 'date-time',
  })
  delayedSendTime?: Date

  @ApiPropertyOptional({ description: 'Full notification payload' })
  payload?: any

  @ApiProperty({ description: 'Timestamp when the request was created' })
  createdAt: Date

  @ApiPropertyOptional({ description: 'User or system that created the request' })
  createdBy?: string

  @ApiProperty({ description: 'Timestamp when the request was last updated' })
  updatedAt: Date

  @ApiPropertyOptional({ description: 'User or system that last updated the request' })
  updatedBy?: string

  @ApiPropertyOptional({ description: 'Error reason if the notification failed' })
  errorReason?: string
}
