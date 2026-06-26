import {
  IsString,
  IsUUID,
  IsArray,
  IsObject,
  IsOptional,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { BULK_EMAIL_MAX_ROWS } from './bulk-email.constants'
import { IsValidBulkRows } from './validators/bulk-rows.validator'
import { IsValidDateString } from './validators/date-string.validator'

export class BulkEmailRequest {
  @ApiProperty({
    description: 'Name of the bulk sending job',
    example: 'January Appointment Reminders',
  })
  @IsString()
  name: string

  @ApiProperty({
    description: 'Template ID to render for every recipient',
    example: '12345678-1234-1234-1234-123456789012',
    format: 'uuid',
  })
  @IsUUID()
  templateId: string

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Global params applied to every batch when rendering the template',
    example: { province: 'BC', city: 'Victoria', total: 7 },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>

  @ApiPropertyOptional({
    description: 'Datetime for delayed send (ISO 8601, RFC 2822, or other standard formats)',
    example: '2026-06-19T22:56:43.321Z',
  })
  @IsOptional()
  @IsValidDateString()
  delayedSend?: string

  @ApiProperty({
    description:
      'Array of arrays. First row is the header (must include an "email address" column); each following row is one recipient. Extra columns become per-recipient template params.',
    example: [
      ['email address', 'name'],
      ['alice@example.com', 'Alice'],
      ['bob@example.com', 'Bob'],
    ],
  })
  @IsArray()
  @ArrayMinSize(2, {
    message: 'rows must have at least a header row and one recipient row',
  })
  @ArrayMaxSize(BULK_EMAIL_MAX_ROWS)
  @IsValidBulkRows()
  rows: string[][]
}
