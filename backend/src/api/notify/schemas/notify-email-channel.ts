import { IsArray, IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidDateString } from './validators/date-string.validator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { ValidateRecipientsOrMerge } from './validators/recipients-or-merge.validator'
import { NotifyAttachment } from './notify-attachment'
import { NotifyEmailRecipients } from './notify-email-recipients'
import { NotifyContent } from './notify-content'

@ValidateTemplateOrRenderer()
export class NotifyEmailChannel {
  @ApiProperty({
    type: NotifyEmailRecipients,
    description: 'Email recipients: to/cc/bcc or a mergeArray for mail-merge',
  })
  @ValidateNested()
  @ValidateRecipientsOrMerge()
  @Type(() => NotifyEmailRecipients)
  recipients: NotifyEmailRecipients

  @ApiPropertyOptional({ type: NotifyContent, description: 'Email content (subject, body, etc.)' })
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
