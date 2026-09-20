import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsDefined,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateIf,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { BULK_MAX_ROWS } from '../constants'
import { IsFutureDateString } from '../../notify/schemas/validators/date-string.validator'

export class PostBulkRequest {
  @ApiProperty({
    description: 'Template ID to use',
    example: '12345678-1234-1234-1234-123456789012',
    format: 'uuid',
  })
  @IsUUID()
  template_id: string

  @ApiProperty({
    description: 'Name of the bulk sending job',
    example: 'January Appointment Reminders',
  })
  @IsString()
  name: string

  @ApiPropertyOptional({
    description: 'Reference for this batch',
    example: 'batch-reference-123',
  })
  @IsOptional()
  @IsString()
  reference?: string

  @ApiPropertyOptional({
    description:
      'CSV content. Pass the full content of your CSV file. Do not include rows if using csv. One of rows or csv is required.',
    example: 'email address,name\nalice@example.com,Alice\nbob@example.com,Bob',
  })
  @ValidateIf((o: PostBulkRequest) => !o.rows)
  @IsDefined({ message: 'You should specify either rows or csv' })
  @IsString()
  csv?: string

  @ApiPropertyOptional({
    // string[][], so the items are themselves arrays. Declared explicitly because the reflected
    // type is just `Array` - published as a flat string[], a generated client gets the wrong type
    // and a spec-driven validator rejects every valid bulk send.
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    minItems: 2,
    maxItems: BULK_MAX_ROWS,
    description:
      'Rows of the send, as an array of arrays. The first row is the header: a recipient column ' +
      'named "email address" or "phone number", plus one column per template placeholder. Each ' +
      'row after it is one recipient. 1-50,000 recipients. Supply either rows or csv, not both.',
    example: [
      ['email address', 'name'],
      ['alice@example.com', 'Alice'],
      ['bob@example.com', 'Bob'],
    ],
  })
  @ValidateIf((o: PostBulkRequest) => !o.csv)
  @IsDefined({ message: 'You should specify either rows or csv' })
  @IsArray()
  // Each row is itself an array. Without this a flat string[] passes validation and only fails
  // later in GcNotifyBulkValidationService, as "a phone number column could not be identified".
  @IsArray({ each: true })
  @ArrayMinSize(2, {
    message: 'rows must have at least a header row and one data row (1-50,000 recipients)',
  })
  @ArrayMaxSize(BULK_MAX_ROWS)
  rows?: string[][]

  @ApiPropertyOptional({
    description:
      'Hold the job until this time instead of sending immediately. A timezone is required - use ' +
      'a `Z` suffix or a numeric offset such as `-07:00`. A time in the past is rejected rather than sent immediately.',
    example: '2027-06-01T16:00:00Z',
  })
  @IsOptional()
  @IsFutureDateString()
  scheduled_for?: string

  @ApiPropertyOptional({
    description: 'ID of the reply-to address or phone number to use',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  reply_to_id?: string
}
