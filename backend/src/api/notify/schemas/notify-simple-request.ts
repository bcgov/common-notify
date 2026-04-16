import { IsObject, IsOptional, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { NotifyEmailChannel } from './notify-email-channel'
import { NotifySmsChannel } from './notify-sms-channel'

export class NotifySimpleRequest {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>

  @ApiPropertyOptional({ type: NotifyEmailChannel })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotifyEmailChannel)
  email?: NotifyEmailChannel

  @ApiPropertyOptional({ type: NotifySmsChannel })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotifySmsChannel)
  sms?: NotifySmsChannel
}
