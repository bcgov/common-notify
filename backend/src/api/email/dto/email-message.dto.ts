import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsObject,
  IsISO8601,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * Represents an email attachment
 */
export class EmailAttachmentDto {
  @ApiProperty({
    description: 'Base64-encoded file content',
    example: 'SGVsbG8gV29ybGQ=',
  })
  @IsString()
  content: string

  @ApiProperty({
    description: 'MIME type of the attachment',
    example: 'application/pdf',
  })
  @IsString()
  contentType: string

  @ApiProperty({
    description: 'Original filename',
    example: 'document.pdf',
  })
  @IsString()
  filename: string

  @ApiProperty({
    description: 'Content disposition (attachment or inline)',
    enum: ['attachment', 'inline'],
    example: 'attachment',
  })
  @IsString()
  disposition: string
}

/**
 * CHES (Common Hosted Email Service) message format
 * Maps to the CHESMessage interface for email sending
 */
export class EmailMessageDto {
  @ApiProperty({
    description: 'Sender email address',
    example: 'noreply@gov.bc.ca',
  })
  @IsString()
  from: string

  @ApiProperty({
    description: 'Array of recipient email addresses',
    example: ['recipient@example.com'],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  to: string[]

  @ApiPropertyOptional({
    description: 'Array of CC recipients',
    example: ['cc@example.com'],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  cc?: string[]

  @ApiPropertyOptional({
    description: 'Array of BCC recipients',
    example: ['bcc@example.com'],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bcc?: string[]

  @ApiProperty({
    description: 'Email subject',
    example: 'Welcome to Notify',
  })
  @IsString()
  subject: string

  @ApiProperty({
    description: 'Email body content',
    example: '<h1>Hello</h1><p>This is a test email.</p>',
  })
  @IsString()
  body: string

  @ApiPropertyOptional({
    description: 'Format of body content',
    enum: ['text', 'html'],
    default: 'text',
    example: 'html',
  })
  @IsEnum(['text', 'html'])
  @IsOptional()
  bodyType?: 'text' | 'html'

  @ApiPropertyOptional({
    description: 'Character encoding',
    example: 'UTF-8',
  })
  @IsString()
  @IsOptional()
  encoding?: string

  @ApiPropertyOptional({
    description: 'Email priority level',
    enum: ['low', 'normal', 'high'],
    default: 'normal',
    example: 'normal',
  })
  @IsEnum(['low', 'normal', 'high'])
  @IsOptional()
  priority?: 'low' | 'normal' | 'high'

  @ApiPropertyOptional({
    description: 'Array of email attachments',
    type: [EmailAttachmentDto],
    example: [
      {
        content: 'SGVsbG8gV29ybGQ=',
        contentType: 'application/pdf',
        filename: 'document.pdf',
        disposition: 'attachment',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  attachments?: EmailAttachmentDto[]

  @ApiPropertyOptional({
    description: 'Tag for categorizing the email',
    example: 'notification',
  })
  @IsString()
  @IsOptional()
  tag?: string

  @ApiPropertyOptional({
    description: 'ISO 8601 timestamp to delay sending (null = send immediately)',
    example: '2026-04-07T19:35:19.078Z',
  })
  @IsISO8601()
  @IsOptional()
  delayTs?: string | null

  @ApiPropertyOptional({
    description: 'Object containing template variables for mail merge',
    example: { firstName: 'John', lastName: 'Doe' },
  })
  @IsObject()
  @IsOptional()
  mergeData?: Record<string, any>
}
