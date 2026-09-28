import { IsArray, IsEmail, IsOptional, ArrayMaxSize } from 'class-validator'
import { ApiSchema, ApiPropertyOptional, PickType } from '@nestjs/swagger'
import { MAIL_MERGE_MAX_ROWS } from './mail-merge.constants'
import { IsValidMergeArray } from './validators/merge-array.validator'

@ApiSchema({
  description: 'Email recipients: to/cc/bcc, or a mergeArray for a mail-merge send.',
})
export class NotifyEmailRecipients {
  @ApiPropertyOptional({
    type: [String],
    description: 'Primary recipients.',
    example: ['citizen@example.com'],
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  to?: string[]

  @ApiPropertyOptional({
    type: [String],
    description: 'Copied recipients. Visible to everyone on the message.',
    example: ['caseworker@example.com'],
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[]

  @ApiPropertyOptional({
    type: [String],
    description: 'Blind-copied recipients. Not visible to the other recipients.',
    example: ['records@example.com'],
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[]

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    description:
      'Mail-merge rows. First row is the header (must include a "to" column for recipient address); each following row is one recipient. Extra columns become per-recipient template params. Mutually exclusive with to/cc/bcc.',
    example: [
      ['to', 'firstname', 'lastname'],
      ['alice@example.com', 'Alice', 'Smith'],
      ['bob@example.com', 'Bob', 'Jones'],
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAIL_MERGE_MAX_ROWS)
  @IsValidMergeArray()
  mergeArray?: string[][]
}

/**
 * The two shapes `recipients` may take, for documentation only.
 *
 * The runtime DTO stays `NotifyEmailRecipients` - one class, validated by ValidateRecipientsOrMerge,
 * which enforces exactly one of these two forms. These are `PickType` projections of it rather than
 * hand-written twins, so a field only ever has to be defined once.
 */
@ApiSchema({
  name: 'EmailRecipients',
  description: 'Address the message directly. Mutually exclusive with a mail-merge send.',
})
export class NotifyEmailAddressRecipients extends PickType(NotifyEmailRecipients, [
  'to',
  'cc',
  'bcc',
] as const) {}

@ApiSchema({
  name: 'EmailMailMerge',
  description:
    'Mail-merge: one message per row, personalised from the row. Mutually exclusive with to/cc/bcc.',
})
export class NotifyEmailMergeRecipients extends PickType(NotifyEmailRecipients, [
  'mergeArray',
] as const) {}
