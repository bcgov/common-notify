import { IsArray, IsEmail, IsOptional, ArrayMaxSize } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { MAIL_MERGE_MAX_ROWS } from './mail-merge.constants'
import { IsValidMergeArray } from './validators/merge-array.validator'

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
