import { IsEnum, IsInt, Max, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { NotificationChannel } from '../../../enum/notification-channel.enum'

/**
 * Updates the warning threshold for a tenant's notification limits on a channel.
 * Restricted to NOTIFY_OPERATIONS_ADMIN at the route level.
 */
export class UpdateThresholdDto {
  @ApiProperty({
    description: 'Channel whose alert threshold is being updated',
    enum: NotificationChannel,
    example: NotificationChannel.EMAIL,
  })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel

  @ApiProperty({
    description: 'Percent of a limit at which a warning alert is sent (1-100)',
    minimum: 1,
    maximum: 100,
    example: 80,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  warnThresholdPercent: number
}
