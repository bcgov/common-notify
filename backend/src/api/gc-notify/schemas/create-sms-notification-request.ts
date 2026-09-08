import { IsString, IsOptional, IsObject, IsUUID } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNormalizablePhoneNumber } from '../../notify/schemas/validators/normalizable-phone-number.validator'

export class CreateSmsNotificationRequest {
  @ApiProperty({
    description: 'Phone number of the recipient',
    example: '+1234567890',
  })
  @IsString()
  @IsNormalizablePhoneNumber({
    message: 'Phone number must be resolvable to E.164 format',
  })
  phone_number: string

  @ApiProperty({
    description: 'ID of the template to use',
    example: '12345678-1234-1234-1234-123456789012',
    format: 'uuid',
  })
  @IsUUID()
  template_id: string

  @ApiPropertyOptional({
    description: 'Values for the template placeholders.',
    example: { appointmentTime: '09:00' },
  })
  @IsOptional()
  @IsObject()
  personalisation?: Record<string, string>

  @ApiPropertyOptional({
    description: 'Your own identifier for this send, echoed back on status lookups.',
    example: 'appointment-48219',
  })
  @IsOptional()
  @IsString()
  reference?: string

  @ApiPropertyOptional({
    description: 'Hold the message until this time instead of sending immediately.',
    format: 'date-time',
    example: '2026-06-01T16:00:00Z',
  })
  @IsOptional()
  @IsString()
  scheduled_for?: string

  @ApiPropertyOptional({
    description: 'Sender identity to send from, when the tenant has more than one configured.',
    format: 'uuid',
    example: 'e2f7a0d5-8c31-4b92-a7de-1f6b4c0e9a52',
  })
  @IsOptional()
  @IsUUID()
  sms_sender_id?: string
}
