import { IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { NotifyEmailChannel } from './notify-email-channel'
import { NotifySmsChannel } from './notify-sms-channel'
import { NotifyMsgAppChannel } from './notify-msg-app-channel'
import { ValidateTemplateOrContent } from './validators/template-or-content.validator'

@ValidateTemplateOrContent()
export class NotifySimpleRequest {
  @ApiPropertyOptional({
    type: 'string',
    format: 'uuid',
    description: 'ID of the template to use for this notification',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string

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

  @ApiPropertyOptional({ type: NotifyMsgAppChannel })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotifyMsgAppChannel)
  msgApp?: NotifyMsgAppChannel
}
