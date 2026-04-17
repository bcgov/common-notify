import {
  IsEmail,
  IsString,
  IsOptional,
  IsObject,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileAttachment } from './file-attachment';

export class CreateEmailNotificationRequest {
  @ApiPropertyOptional({
    description: 'Optional reference identifier',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({
    description: 'Email address of the recipient',
    example: 'user@example.com',
  })
  @IsEmail()
  email_address: string;

  @ApiProperty({
    description: 'ID of the template to use',
    example: '12345678-1234-1234-1234-123456789012',
    format: 'uuid',
  })
  @IsUUID()
  template_id: string;

  @ApiPropertyOptional({
    description:
      'Variables to substitute in the template and optional file attachments',
  })
  @IsOptional()
  @IsObject()
  personalisation?: Record<string, string | FileAttachment>;

  @ApiPropertyOptional({
    description: 'Schedule notification for future delivery',
    format: 'date-time',
  })
  @IsOptional()
  @IsString()
  scheduled_for?: string;

  @ApiPropertyOptional({
    description: 'ID of the reply-to address to use',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  email_reply_to_id?: string;
}
