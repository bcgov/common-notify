import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsDefined,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BULK_MAX_ROWS } from '../constants';

export class PostBulkRequest {
  @ApiProperty({
    description: 'Template ID to use',
    example: '12345678-1234-1234-1234-123456789012',
    format: 'uuid',
  })
  @IsUUID()
  template_id: string;

  @ApiProperty({
    description: 'Name of the bulk sending job',
    example: 'January Appointment Reminders',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Reference for this batch',
    example: 'batch-reference-123',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({
    description:
      'CSV content. Pass the full content of your CSV file. Do not include rows if using csv. One of rows or csv is required.',
    example: 'email address,name\nalice@example.com,Alice\nbob@example.com,Bob',
  })
  @ValidateIf((o: PostBulkRequest) => !o.rows)
  @IsDefined({ message: 'You should specify either rows or csv' })
  @IsString()
  csv?: string;

  @ApiPropertyOptional({
    description:
      'Array of arrays. First line is header (email address/phone number + placeholder columns). 1-50,000 recipients. One of rows or csv is required.',
    example: [
      ['email address', 'name'],
      ['alice@example.com', 'Alice'],
      ['bob@example.com', 'Bob'],
    ],
  })
  @ValidateIf((o: PostBulkRequest) => !o.csv)
  @IsDefined({ message: 'You should specify either rows or csv' })
  @IsArray()
  @ArrayMinSize(2, {
    message:
      'rows must have at least a header row and one data row (1-50,000 recipients)',
  })
  @ArrayMaxSize(BULK_MAX_ROWS)
  rows?: string[][];

  @ApiPropertyOptional({
    description: 'Schedule for future send (up to 4 days), ISO 8601 format UTC',
    example: '2025-06-25T15:15:00Z',
  })
  @IsOptional()
  @IsString()
  scheduled_for?: string;

  @ApiPropertyOptional({
    description: 'ID of the reply-to address or phone number to use',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  reply_to_id?: string;
}
