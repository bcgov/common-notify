import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationStatus } from './create-notification-request'

export class NotificationRequestDto {
  @ApiProperty({ description: 'Unique identifier for the notification request', format: 'uuid' })
  id: string

  @ApiProperty({ description: 'Tenant that submitted the request', format: 'uuid' })
  tenantId: string

  @ApiProperty({
    enum: NotificationStatus,
    description: 'Processing status of the notification request',
  })
  status: string

  @ApiProperty({ description: 'Timestamp when the request was created' })
  createdAt: Date

  @ApiPropertyOptional({ description: 'User or system that created the request' })
  createdBy?: string

  @ApiProperty({ description: 'Timestamp when the request was last updated' })
  updatedAt: Date

  @ApiPropertyOptional({ description: 'User or system that last updated the request' })
  updatedBy?: string
}
