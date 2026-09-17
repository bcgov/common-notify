import { IsEmail, IsString, IsOptional, IsObject, IsUUID } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { FileAttachment } from './file-attachment'

export class CreateEmailNotificationRequest {
  @ApiPropertyOptional({
    description: 'Your own identifier for this send, echoed back on status lookups.',
    example: 'permit-BC-2026-00417',
  })
  @IsOptional()
  @IsString()
  reference?: string

  @ApiProperty({
    description: 'Email address of the recipient',
    example: 'user@example.com',
  })
  @IsEmail()
  email_address: string

  @ApiProperty({
    description: 'ID of the template to use',
    example: '12345678-1234-1234-1234-123456789012',
    format: 'uuid',
  })
  @IsUUID()
  template_id: string

  @ApiPropertyOptional({
    description:
      'Values for the template placeholders. A value may also be a list, which renders as bullets ' +
      'in the email body and as "a, b and c" in the subject, or a file attachment.',
    example: { firstName: 'Alice', permitNumber: 'BC-2026-00417', items: ['apples', 'pears'] },
  })
  @IsOptional()
  @IsObject()
  personalisation?: Record<string, string | string[] | FileAttachment>

  @ApiPropertyOptional({
    description: 'Hold the message until this time instead of sending immediately.',
    format: 'date-time',
    example: '2026-06-01T16:00:00Z',
  })
  @IsOptional()
  @IsString()
  scheduled_for?: string

  @ApiPropertyOptional({
    description: 'Reply-to address to use, when the tenant has more than one configured.',
    format: 'uuid',
    example: 'e2f7a0d5-8c31-4b92-a7de-1f6b4c0e9a52',
  })
  @IsOptional()
  @IsUUID()
  email_reply_to_id?: string
}
