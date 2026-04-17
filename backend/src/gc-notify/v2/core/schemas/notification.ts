import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationTemplate } from './notification-template';

export class Notification {
  @ApiProperty({
    description: 'Notification ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  id: string;

  @ApiPropertyOptional({ description: 'Reference identifier' })
  reference?: string;

  @ApiPropertyOptional({
    description: 'Recipient email address',
    format: 'email',
  })
  email_address?: string;

  @ApiPropertyOptional({ description: 'Recipient phone number' })
  phone_number?: string;

  @ApiPropertyOptional()
  line_1?: string;

  @ApiPropertyOptional()
  line_2?: string;

  @ApiPropertyOptional()
  line_3?: string;

  @ApiPropertyOptional()
  line_4?: string;

  @ApiPropertyOptional()
  line_5?: string;

  @ApiPropertyOptional()
  line_6?: string;

  @ApiPropertyOptional()
  postcode?: string;

  @ApiProperty({ description: 'Notification type', enum: ['sms', 'email'] })
  type: 'sms' | 'email';

  @ApiProperty({
    description: 'Notification status',
    enum: [
      'created',
      'sending',
      'pending',
      'delivered',
      'permanent-failure',
      'temporary-failure',
      'technical-failure',
      'pending-virus-check',
      'virus-scan-failed',
    ],
  })
  status: string;

  @ApiPropertyOptional({ description: 'Status description' })
  status_description?: string;

  @ApiPropertyOptional({ description: 'Provider response' })
  provider_response?: string;

  @ApiProperty({ description: 'Template information' })
  template: NotificationTemplate;

  @ApiProperty({ description: 'Message body' })
  body: string;

  @ApiPropertyOptional({ description: 'Email subject (email only)' })
  subject?: string;

  @ApiProperty({ description: 'Created timestamp', format: 'date-time' })
  created_at: string;

  @ApiPropertyOptional({ description: 'Created by name' })
  created_by_name?: string;

  @ApiPropertyOptional({ description: 'Sent timestamp', format: 'date-time' })
  sent_at?: string;

  @ApiPropertyOptional({
    description: 'Completed timestamp',
    format: 'date-time',
  })
  completed_at?: string;

  @ApiPropertyOptional({
    description: 'Scheduled timestamp',
    format: 'date-time',
  })
  scheduled_for?: string;

  @ApiPropertyOptional()
  postage?: string;
}
