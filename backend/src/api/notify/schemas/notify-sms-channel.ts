import { IsArray, IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiExtraModels, ApiPropertyOptional, ApiSchema, getSchemaPath } from '@nestjs/swagger'
import { IsFutureDateString } from './validators/date-string.validator'
import { ApiOneOf, ApiOneOfOptional } from './api-one-of.decorator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { NotifyAttachment } from './notify-attachment'
import {
  NotifySmsAddressRecipients,
  NotifySmsMergeRecipients,
  NotifySmsRecipients,
} from './notify-sms-recipients'
import { ValidateRecipientsOrMerge } from './validators/recipients-or-merge.validator'
import { NotifySmsContent, NotifySmsInlineContent, NotifyTemplateContent } from './notify-content'

@ApiSchema({
  description: 'Send by SMS. SMS must be enabled for the tenant.',
})
@ValidateTemplateOrRenderer()
@ApiExtraModels(
  NotifySmsAddressRecipients,
  NotifySmsMergeRecipients,
  NotifyTemplateContent,
  NotifySmsInlineContent,
)
export class NotifySmsChannel {
  // Mirrors ValidateRecipientsOrMerge exactly; the keywords that make the branches mutually
  // exclusive are in schema-constraints.ts - see NotifyEmailChannel.
  @ApiOneOf({
    description: 'SMS recipients',
    oneOf: [
      { $ref: getSchemaPath(NotifySmsAddressRecipients) },
      { $ref: getSchemaPath(NotifySmsMergeRecipients) },
    ],
  })
  @ValidateNested()
  @ValidateRecipientsOrMerge()
  @Type(() => NotifySmsRecipients)
  recipients: NotifySmsRecipients

  // Mirrors the two constraints that actually run - see NotifyEmailChannel.
  @ApiOneOfOptional({
    description: 'SMS content (body, renderer, encoding, etc.)',
    oneOf: [
      { $ref: getSchemaPath(NotifyTemplateContent) },
      { $ref: getSchemaPath(NotifySmsInlineContent) },
    ],
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotifySmsContent)
  content?: NotifySmsContent

  @ApiPropertyOptional({ type: [NotifyAttachment] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotifyAttachment)
  attachments?: NotifyAttachment[]

  @ApiPropertyOptional({
    description:
      'Hold the message until this time. Omit to send as soon as possible. Accepts ISO 8601 and other common date formats.',
    example: '2027-06-01T16:00:00Z',
  })
  @IsOptional()
  @IsFutureDateString()
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
