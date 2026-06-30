import { IsArray, IsEmail, IsOptional, ArrayMaxSize } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { BULK_EMAIL_MAX_ROWS } from './bulk-email.constants'
import { IsValidBulkRows } from './validators/bulk-rows.validator'

export class NotifyEmailRecipients {
  @ApiPropertyOptional({ type: [String], description: 'Primary recipients' })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  to?: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[]

  @ApiPropertyOptional({ type: [String] })
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
  @ArrayMaxSize(BULK_EMAIL_MAX_ROWS)
  @IsValidBulkRows()
  mergeArray?: string[][]
}
