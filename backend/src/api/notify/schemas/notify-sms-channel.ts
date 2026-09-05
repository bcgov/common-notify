import { IsArray, IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidDateString } from './validators/date-string.validator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { NotifyAttachment } from './notify-attachment'
import { NotifySmsRecipients } from './notify-sms-recipients'
import { ValidateRecipientsOrMerge } from './validators/recipients-or-merge.validator'
import { NotifyContent } from './notify-content'

@ValidateTemplateOrRenderer()
export class NotifySmsChannel {
  @ApiProperty({
    type: NotifySmsRecipients,
    description: 'SMS recipients: a "to" list, or a mergeArray for a mail-merge send',
  })
  @ValidateNested()
  @ValidateRecipientsOrMerge()
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

  @ApiPropertyOptional({ type: [NotifyAttachment] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotifyAttachment)
  attachments?: NotifyAttachment[]

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
  identityId?: string
}
