import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class Template {
  @ApiProperty({
    description: 'Unique identifier for the template',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  id: string

  @ApiProperty({ description: 'Name given to the template.', example: 'Permit approved' })
  name: string

  @ApiPropertyOptional({
    description: 'What the template is used for.',
    example: 'Sent when a permit application is approved',
  })
  description?: string

  @ApiProperty({
    description: 'The channel this template is for.',
    enum: ['sms', 'email'],
    example: 'email',
  })
  type: 'sms' | 'email'

  @ApiPropertyOptional({
    description: 'Subject line, with placeholders. Email only.',
    example: 'Permit {{permitNumber}} approved',
  })
  subject?: string

  @ApiProperty({
    description: 'Message body, with placeholders.',
    example: 'Hello {{firstName}}, permit {{permitNumber}} has been approved.',
  })
  body: string

  @ApiPropertyOptional({
    description: 'The placeholders this template expects, with sample values.',
    example: { firstName: 'Alice', permitNumber: 'BC-2026-00417' },
  })
  personalisation?: Record<string, string>

  @ApiProperty({
    description: 'False once the template has been retired; it can no longer be used to send.',
    example: true,
  })
  active: boolean

  @ApiProperty({
    description: 'When the template was created.',
    format: 'date-time',
    example: '2026-01-04T18:22:11.000Z',
  })
  created_at: string

  @ApiPropertyOptional({
    description: 'When the template last changed.',
    format: 'date-time',
    example: '2026-04-22T09:14:03.000Z',
  })
  updated_at?: string

  @ApiPropertyOptional({ description: 'Who created it.', example: 'permits-service' })
  created_by?: string
}
