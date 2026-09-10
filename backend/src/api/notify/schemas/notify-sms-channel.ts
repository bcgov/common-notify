import { IsArray, IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidDateString } from './validators/date-string.validator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { NotifyAttachment } from './notify-attachment'
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

  @ApiPropertyOptional({ type: [NotifyAttachment] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotifyAttachment)
  attachments?: NotifyAttachment[]

  @ApiPropertyOptional({
    description:
      'Hold the message until this time. Omit to send as soon as possible. Accepts ISO 8601 and ' +
      'other common date formats.',
    example: '2026-06-01T16:00:00Z',
  })
  @IsOptional()
  @IsValidDateString()
  delayedSend?: string

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: "Values for this channel's template placeholders. Overrides top-level params.",
    example: { firstName: 'Alice' },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Sender identity to send as, when the tenant has more than one configured.',
    example: 'e2f7a0d5-8c31-4b92-a7de-1f6b4c0e9a52',
  })
  @IsOptional()
  @IsUUID()
  identityId?: string
}
