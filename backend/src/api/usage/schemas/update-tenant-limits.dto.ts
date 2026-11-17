import { IsEnum, IsInt, IsUUID, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { NotificationChannel } from '../../../enum/notification-channel.enum'

/**
 * Updates a tenant's daily and annual notification limits for a channel.
 * Admin-only (NOTIFY_ADMIN). Applies to every API key the tenant has on the channel.
 */
export class UpdateTenantLimitsDto {
  @ApiProperty({ description: 'Notify tenant id', format: 'uuid' })
  @IsUUID()
  tenantId: string

  @ApiProperty({
    description: 'Channel whose limits are being updated',
    enum: NotificationChannel,
    example: NotificationChannel.EMAIL,
  })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel

  @ApiProperty({ description: 'Maximum notifications per calendar day', example: 100000 })
  @IsInt()
  @Min(1)
  dailyLimit: number

  @ApiProperty({ description: 'Maximum notifications per fiscal year', example: 20000000 })
  @IsInt()
  @Min(1)
  annualLimit: number
}
