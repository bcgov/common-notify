import { IsEmail, IsString, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class SendEmailDto {
  @ApiProperty({
    description: 'Recipient email address',
    example: 'user@example.com',
  })
  @IsEmail()
  to: string

  @ApiProperty({
    description: 'Email subject',
    example: 'Welcome to Notify',
  })
  @IsString()
  subject: string

  @ApiProperty({
    description: 'Email body (plain text)',
    example: 'Hello, this is a test email.',
  })
  @IsString()
  body: string

  @ApiPropertyOptional({
    description: 'CC recipient email addresses (comma-separated)',
    example: 'cc@example.com',
  })
  @IsOptional()
  @IsString()
  cc?: string

  @ApiPropertyOptional({
    description: 'BCC recipient email addresses (comma-separated)',
    example: 'bcc@example.com',
  })
  @IsOptional()
  @IsString()
  bcc?: string
}
