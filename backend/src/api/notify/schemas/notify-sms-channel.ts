import { IsArray, IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiExtraModels, ApiPropertyOptional, ApiSchema, getSchemaPath } from '@nestjs/swagger'
import { IsValidDateString } from './validators/date-string.validator'
import { ApiOneOf, ApiOneOfOptional } from './api-one-of.decorator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { NotifyAttachment } from './notify-attachment'
import {
  NotifySmsAddressRecipients,
  NotifySmsMergeRecipients,
  NotifySmsRecipients,
} from './notify-sms-recipients'
import { ValidateRecipientsOrMerge } from './validators/recipients-or-merge.validator'
import { NotifyContent, NotifyInlineContent, NotifyTemplateContent } from './notify-content'

@ApiSchema({
  description: 'Send by SMS. Requires the sms_notifications feature flag for the tenant.',
})
@ValidateTemplateOrRenderer()
@ApiExtraModels(
  NotifySmsAddressRecipients,
  NotifySmsMergeRecipients,
  NotifyTemplateContent,
  NotifyInlineContent,
)
export class NotifySmsChannel {
  // Mirrors ValidateRecipientsOrMerge exactly - see NotifyEmailChannel for why each branch needs
  // its own required/not constraints.
  @ApiOneOf({
    oneOf: [
      {
        allOf: [{ $ref: getSchemaPath(NotifySmsAddressRecipients) }],
        required: ['to'],
        not: { required: ['mergeArray'] },
      },
      {
        allOf: [{ $ref: getSchemaPath(NotifySmsMergeRecipients) }],
        required: ['mergeArray'],
        not: { required: ['to'] },
      },
    ],
  })
  @ValidateNested()
  @ValidateRecipientsOrMerge()
  @Type(() => NotifySmsRecipients)
  recipients: NotifySmsRecipients

  // Mirrors the two constraints that actually run - see NotifyEmailChannel.
  @ApiOneOfOptional({
    oneOf: [
      {
        allOf: [{ $ref: getSchemaPath(NotifyTemplateContent) }],
        required: ['templateId'],
        not: {
          anyOf: [{ required: ['subject'] }, { required: ['body'] }, { required: ['renderer'] }],
        },
      },
      {
        allOf: [{ $ref: getSchemaPath(NotifyInlineContent) }],
        not: { required: ['templateId'] },
      },
    ],
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
      'Hold the message until this time. Omit to send as soon as possible. ' +
      '**A timezone is required.** Use a `Z` suffix (`2026-06-01T16:00:00Z`), a numeric offset ' +
      'with a colon (`2026-06-01T09:00:00-07:00`), or a trailing abbreviation JavaScript ' +
      'recognises (`2026-06-01 09:00:00 PDT` - PST/PDT/GMT/UTC work, CEST does not). ' +
      'A local time with no zone (`2026-06-01T16:00:00`), a bare date (`2026-06-01`), and a ' +
      'compact offset (`-0700`) are all rejected.',
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
