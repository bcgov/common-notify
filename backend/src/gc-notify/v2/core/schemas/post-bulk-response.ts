import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PostBulkJobCreatedBy {
  @ApiProperty({
    description: 'ID of the user who created the job',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ description: 'Name of the user who created the job' })
  name: string;
}

export class PostBulkJobServiceName {
  @ApiProperty({ description: 'Name of the service that created the job' })
  name: string;
}

export class PostBulkJobApiKey {
  @ApiProperty({ description: 'ID of the API key used', format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Name of the API key' })
  name: string;

  @ApiProperty({
    description: 'Type of API key',
    enum: ['normal', 'team', 'test'],
  })
  key_type: string;
}

export class PostBulkJobData {
  @ApiProperty({
    description: 'ID of the bulk notification job',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ description: 'ID of the template used', format: 'uuid' })
  template: string;

  @ApiProperty({
    description: 'Status of the bulk notification job',
    enum: [
      'pending',
      'in progress',
      'finished',
      'sending limits exceeded',
      'scheduled',
      'cancelled',
      'ready to send',
      'sent to dvla',
      'error',
    ],
  })
  job_status: string;

  @ApiProperty({ description: 'Number of notifications in the bulk job' })
  notification_count: number;

  @ApiPropertyOptional({
    description: 'Name of the original CSV file if provided',
  })
  original_file_name?: string;

  @ApiPropertyOptional({ description: 'Template version used' })
  template_version?: number;

  @ApiPropertyOptional({
    description: 'ID of the service that created the job',
    format: 'uuid',
  })
  service?: string;

  @ApiPropertyOptional({ description: 'User who created the job' })
  created_by?: PostBulkJobCreatedBy;

  @ApiProperty({ description: 'When the job was created', format: 'date-time' })
  created_at: string;

  @ApiPropertyOptional({
    description: 'When the job was last updated',
    format: 'date-time',
  })
  updated_at?: string;

  @ApiPropertyOptional({
    description: 'When the job is scheduled to be processed',
    format: 'date-time',
  })
  scheduled_for?: string;

  @ApiPropertyOptional({
    description: 'When processing started',
    format: 'date-time',
  })
  processing_started?: string;

  @ApiPropertyOptional({
    description: 'When processing finished',
    format: 'date-time',
  })
  processing_finished?: string;

  @ApiPropertyOptional({ description: 'Name of the service' })
  service_name?: PostBulkJobServiceName;

  @ApiPropertyOptional({
    description: 'Type of template used',
    enum: ['email', 'sms'],
  })
  template_type?: string;

  @ApiPropertyOptional({ description: 'API key used' })
  api_key?: PostBulkJobApiKey;

  @ApiPropertyOptional({ description: 'Whether the job has been archived' })
  archived?: boolean;

  @ApiPropertyOptional({ description: 'ID of the sender used', format: 'uuid' })
  sender_id?: string;
}

export class PostBulkResponse {
  @ApiProperty({
    description: 'Bulk job data',
    type: PostBulkJobData,
  })
  data: PostBulkJobData;
}
