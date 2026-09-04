import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class PostBulkJobCreatedBy {
  @ApiProperty({
    description: 'ID of the user who created the job.',
    example: 'a4d9e0c2-71bf-4a3e-9d18-2c8f5b6e4a70',
    format: 'uuid',
  })
  id: string

  @ApiProperty({ description: 'Name of the user who created the job.', example: 'A. Smith' })
  name: string
}

export class PostBulkJobServiceName {
  @ApiProperty({
    description: 'Name of the service that created the job.',
    example: 'permits-service',
  })
  name: string
}

export class PostBulkJobApiKey {
  @ApiProperty({
    description: 'ID of the API key used.',
    format: 'uuid',
    example: 'c8b0f3a1-5d27-4e6b-8f90-3a1e7d2c4b58',
  })
  id: string

  @ApiProperty({ description: 'Name of the API key.', example: 'permits-service-prod' })
  name: string

  @ApiProperty({
    description: 'Type of API key.',
    example: 'normal',
    enum: ['normal', 'team', 'test'],
  })
  key_type: string
}

export class PostBulkJobData {
  @ApiProperty({
    description: 'ID of the bulk notification job.',
    example: '6f2b9d40-8c15-4a73-b0e2-9d4c1f7a3e58',
    format: 'uuid',
  })
  id: string

  @ApiProperty({
    description: 'ID of the template used.',
    format: 'uuid',
    example: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33',
  })
  template: string

  @ApiProperty({
    description: 'Where the job has got to.',
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
    example: 'in progress',
  })
  job_status: string

  @ApiProperty({ description: 'How many notifications the job contains.', example: 250 })
  notification_count: number

  @ApiPropertyOptional({
    description: 'Name of the uploaded CSV, when the job came from a file.',
    example: 'permit-renewals-may.csv',
  })
  original_file_name?: string

  @ApiPropertyOptional({ description: 'Version of the template used.', example: 3 })
  template_version?: number

  @ApiPropertyOptional({
    description: 'ID of the service that created the job.',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    format: 'uuid',
  })
  service?: string

  @ApiPropertyOptional({ description: 'User who created the job' })
  created_by?: PostBulkJobCreatedBy

  @ApiProperty({
    description: 'When the job was created.',
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
  })
  created_at: string

  @ApiPropertyOptional({
    description: 'When the job last changed.',
    example: '2026-05-15T10:02:41.000Z',
    format: 'date-time',
  })
  updated_at?: string

  @ApiPropertyOptional({
    description: 'When a delayed job is due to run.',
    example: '2026-06-01T16:00:00.000Z',
    format: 'date-time',
  })
  scheduled_for?: string

  @ApiPropertyOptional({
    description: 'When processing started.',
    example: '2026-05-15T10:00:03.000Z',
    format: 'date-time',
  })
  processing_started?: string

  @ApiPropertyOptional({
    description: 'When processing finished.',
    example: '2026-05-15T10:04:52.000Z',
    format: 'date-time',
  })
  processing_finished?: string

  @ApiPropertyOptional({ description: 'Name of the service' })
  service_name?: PostBulkJobServiceName

  @ApiPropertyOptional({
    description: 'Type of template used',
    enum: ['email', 'sms'],
  })
  template_type?: string

  @ApiPropertyOptional({ description: 'API key used' })
  api_key?: PostBulkJobApiKey

  @ApiPropertyOptional({ description: 'Whether the job has been archived' })
  archived?: boolean

  @ApiPropertyOptional({ description: 'ID of the sender used', format: 'uuid' })
  sender_id?: string
}

export class PostBulkResponse {
  @ApiProperty({
    description: 'Bulk job data',
    type: PostBulkJobData,
  })
  data: PostBulkJobData
}
