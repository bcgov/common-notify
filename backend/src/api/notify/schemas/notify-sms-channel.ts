import { IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidDateString } from './validators/date-string.validator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { NotifySmsRecipients } from './notify-sms-recipients'
import { NotifyContent } from './notify-content'

@ValidateTemplateOrRenderer()
export class NotifySmsChannel {
  @ApiProperty({ type: NotifySmsRecipients, description: 'SMS recipients' })
  @ValidateNested()
  @Type(() => NotifySmsRecipients)
  recipients: NotifySmsRecipients

  @ApiPropertyOptional({
    type: NotifyContent,
    description: 'SMS content (body, renderer, encoding, etc.)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotifyContent)
  content?: NotifyContent

  @ApiPropertyOptional({
    description: 'Datetime for delayed send (ISO 8601, RFC 2822, or other standard formats)',
  })
  @IsOptional()
  @IsValidDateString()
  delayedSend?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  templateId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  identityId?: string
}
