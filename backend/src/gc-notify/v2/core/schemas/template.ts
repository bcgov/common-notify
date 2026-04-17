import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class Template {
  @ApiProperty({
    description: 'Unique identifier for the template',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ description: 'Template name' })
  name: string;

  @ApiPropertyOptional({ description: 'Template description' })
  description?: string;

  @ApiProperty({
    description: 'Type of notification this template is for',
    enum: ['sms', 'email'],
  })
  type: 'sms' | 'email';

  @ApiPropertyOptional({ description: 'Subject template (for email)' })
  subject?: string;

  @ApiProperty({ description: 'Message body template' })
  body: string;

  @ApiPropertyOptional({
    description: 'Variables to substitute in the template',
  })
  personalisation?: Record<string, string>;

  @ApiProperty({ description: 'Whether the template is active' })
  active: boolean;

  @ApiProperty({
    description: 'Timestamp when template was created',
    format: 'date-time',
  })
  created_at: string;

  @ApiPropertyOptional({
    description: 'Timestamp when template was last updated',
    format: 'date-time',
  })
  updated_at?: string;

  @ApiPropertyOptional({ description: 'User who created the template' })
  created_by?: string;
}
