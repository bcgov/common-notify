import { IsString, IsUUID, IsOptional, IsEnum } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export enum NotificationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class CreateNotificationRequestDto {
  @ApiProperty({ description: 'Tenant UUID that submitted the request', format: 'uuid' })
  @IsUUID()
  tenantId: string

  @ApiPropertyOptional({
    enum: NotificationStatus,
    default: NotificationStatus.QUEUED,
    description: 'Initial processing status of the notification request',
  })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus

  @ApiPropertyOptional({ description: 'User or system that created the request' })
  @IsOptional()
  @IsString()
  createdBy?: string
}
