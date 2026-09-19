import { IsIn, IsOptional } from 'class-validator'
import { IsValidDateString } from './validators/date-string.validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

/**
 * DTO for cancelling a notification
 */
export class CancelNotificationDto {
  @ApiPropertyOptional({
    enum: ['cancel'],
    example: 'cancel',
    description:
      'Set to `cancel` to cancel a pending notification. The only accepted value. Supply either ' +
      'this or `scheduledTime` - a request carrying neither is rejected.',
  })
  @IsOptional()
  @IsIn(['cancel'])
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
    description:
      'New time to deliver at. A timezone is required, the same as `delayedSend` - use a `Z` ' +
      'suffix or a numeric offset such as `-07:00`.',
  })
  @IsOptional()
  @IsValidDateString()
  scheduledTime?: string
}

/**
 * Union type for the request body
 */
export type CancelOrRescheduleDto = CancelNotificationDto | RescheduleNotificationDto
