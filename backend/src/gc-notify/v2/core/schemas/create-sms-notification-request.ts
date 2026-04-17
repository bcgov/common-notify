import {
  IsString,
  IsOptional,
  IsObject,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSmsNotificationRequest {
  @ApiProperty({
    description: 'Phone number of the recipient',
    example: '+1234567890',
  })
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone number must be in E.164 format',
  })
  phone_number: string;

  @ApiProperty({
    description: 'ID of the template to use',
    example: '12345678-1234-1234-1234-123456789012',
    format: 'uuid',
  })
  @IsUUID()
  template_id: string;

  @ApiPropertyOptional({
    description: 'Variables to substitute in the template',
  })
  @IsOptional()
  @IsObject()
  personalisation?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Optional reference identifier',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({
    description: 'Schedule notification for future delivery',
    format: 'date-time',
  })
  @IsOptional()
  @IsString()
  scheduled_for?: string;

  @ApiPropertyOptional({
    description: 'ID of the SMS sender to use',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  sms_sender_id?: string;
}
