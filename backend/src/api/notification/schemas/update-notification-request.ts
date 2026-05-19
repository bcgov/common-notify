import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationStatus } from './create-notification-request'
import { QuarantineDetails } from '../entities/notification-request.entity'

export class UpdateNotificationRequestDto {
  @ApiPropertyOptional({
    enum: NotificationStatus,
    description: 'Updated processing status of the notification request',
  })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus

  @ApiPropertyOptional({ description: 'User or system performing the update' })
  @IsOptional()
  @IsString()
  updatedBy?: string

  @ApiPropertyOptional({ description: 'Error reason when notification fails' })
  @IsOptional()
  @IsString()
  errorReason?: string

  @ApiPropertyOptional({
    type: 'object',
    description: 'Quarantine details when notification is flagged as malware',
  })
  @IsOptional()
  @IsObject()
  quarantineDetails?: QuarantineDetails
}
