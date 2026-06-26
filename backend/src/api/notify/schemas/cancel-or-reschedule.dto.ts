import { IsOptional, IsISO8601 } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

/**
 * DTO for cancelling a notification
 */
export class CancelNotificationDto {
  @ApiPropertyOptional({
    example: 'cancel',
    description: 'Action to perform (cancel)',
  })
  @IsOptional()
  action?: 'cancel'
}

/**
 * DTO for rescheduling a notification
 */
export class RescheduleNotificationDto {
  @ApiPropertyOptional({
    type: 'string',
    format: 'date-time',
    example: '2026-05-15T10:00:00Z',
    description: 'New scheduled time for delivery (must be in the future)',
  })
  @IsOptional()
  @IsISO8601()
  scheduledTime?: string
}

/**
 * Union type for the request body
 */
export type CancelOrRescheduleDto = CancelNotificationDto | RescheduleNotificationDto
