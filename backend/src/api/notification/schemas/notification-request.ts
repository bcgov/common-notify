import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationStatus } from './create-notification-request'
import { TenantDto } from './tenant'

export class NotificationChannelCodeDto {
  @ApiProperty({ description: 'Channel code identifier' })
  channelCode: string

  @ApiProperty({ description: 'Display name for the channel' })
  displayName: string

  @ApiPropertyOptional({ description: 'Description of the channel' })
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
    enum: NotificationStatus,
    description: 'Processing status of the notification request',
  })
  status: string

  @ApiPropertyOptional({
    description: 'Primary notification channel code',
    example: 'EMAIL',
    enum: ['EMAIL', 'SMS', 'MSGAPP', 'MULTIPLE'],
  })
  channelCode?: string

  @ApiPropertyOptional({
    type: NotificationChannelCodeDto,
    description: 'Channel code details including display name',
  })
  channel?: NotificationChannelCodeDto

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
