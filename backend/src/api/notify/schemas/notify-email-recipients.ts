import { IsArray, IsEmail, IsOptional, ArrayMinSize } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class NotifyEmailRecipients {
  @ApiProperty({ type: [String], description: 'Primary recipients' })
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  to: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[]
}
