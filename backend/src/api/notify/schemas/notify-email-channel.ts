import { IsArray, IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiExtraModels, ApiPropertyOptional, ApiSchema, getSchemaPath } from '@nestjs/swagger'
import { IsFutureDateString } from './validators/date-string.validator'
import { ApiOneOf, ApiOneOfOptional } from './api-one-of.decorator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { ValidateRecipientsOrMerge } from './validators/recipients-or-merge.validator'
import { NotifyAttachment } from './notify-attachment'
import {
  NotifyEmailAddressRecipients,
  NotifyEmailMergeRecipients,
  NotifyEmailRecipients,
} from './notify-email-recipients'
import { NotifyContent, NotifyEmailInlineContent, NotifyTemplateContent } from './notify-content'

@ApiSchema({
  description:
    'Send by email: recipients, content (inline or a stored template), attachments and scheduling.',
})
@ValidateTemplateOrRenderer()
@ApiExtraModels(
  NotifyEmailAddressRecipients,
  NotifyEmailMergeRecipients,
  NotifyTemplateContent,
  NotifyEmailInlineContent,
)
export class NotifyEmailChannel {
  // Exactly one of the two forms, which is what ValidateRecipientsOrMerge enforces at runtime.
  // The transform target stays the combined class: class-transformer has no discriminator to pick
  // between them, and it does not need one - the validator rejects anything that is not one shape
  // or the other. The keywords that make the branches mutually exclusive are in
  // schema-constraints.ts, so each branch stays a bare $ref that Swagger UI labels by name.
  @ApiOneOf({
    description: 'Email recipients: to/cc/bcc or a mergeArray for mail-merge',
    oneOf: [
      { $ref: getSchemaPath(NotifyEmailAddressRecipients) },
      { $ref: getSchemaPath(NotifyEmailMergeRecipients) },
    ],
  })
  @ValidateNested()
  @ValidateRecipientsOrMerge()
  @Type(() => NotifyEmailRecipients)
  recipients: NotifyEmailRecipients

  // Mirrors the two constraints that actually run: templateId never alongside subject/body
  // (TemplateOrContentConstraint) and never alongside renderer (TemplateOrRendererConstraint).
  // Neither rule requires a channel to carry content at all - the request-level rule only asks that
  // *some* channel renders something - so the inline branch deliberately requires nothing.
  @ApiOneOfOptional({
    description: 'Email content (subject, body, etc.)',
    oneOf: [
      { $ref: getSchemaPath(NotifyTemplateContent) },
      { $ref: getSchemaPath(NotifyEmailInlineContent) },
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
