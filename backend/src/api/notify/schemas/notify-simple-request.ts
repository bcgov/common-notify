import { IsObject, IsOptional, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { NotifyEmailChannel } from './notify-email-channel'
import { NotifySmsChannel } from './notify-sms-channel'
import { NotifyMsgAppChannel } from './notify-msg-app-channel'
import { ValidateTemplateOrContent } from './validators/template-or-content.validator'

@ValidateTemplateOrContent()
export class NotifySimpleRequest {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      "Values substituted into template placeholders, applied to every channel. A channel's own " +
      'params take precedence.',
    example: { firstName: 'Alice', permitNumber: 'BC-2026-00417' },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>

  @ApiPropertyOptional({
    description: 'Send by email. At least one channel must be present.',
    type: NotifyEmailChannel,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotifyEmailChannel)
  email?: NotifyEmailChannel

  @ApiPropertyOptional({
    description: 'Send by SMS. Requires the sms_notifications feature flag.',
    type: NotifySmsChannel,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotifySmsChannel)
  sms?: NotifySmsChannel

  @ApiPropertyOptional({ description: 'Send by messaging app.', type: NotifyMsgAppChannel })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotifyMsgAppChannel)
  msgApp?: NotifyMsgAppChannel
}
