import {
  IsString,
  IsArray,
  IsEmail,
  IsOptional,
  IsEnum,
  IsUUID,
  IsObject,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidDateString } from './validators/date-string.validator'

export class NotifyAttachment {
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string
  @ApiPropertyOptional() @IsOptional() @IsString() contentType?: string
  @ApiPropertyOptional() @IsOptional() @IsString() filename?: string
  @ApiPropertyOptional() @IsOptional() @IsString() disposition?: string
}

export class NotifyEmailChannel {
  @ApiProperty({ type: [String], description: 'Email recipients' })
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  recipients: string[]

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

  @ApiProperty() @IsString() subject: string

  @ApiProperty() @IsString() body: string

  @ApiPropertyOptional({ enum: ['text', 'html'] })
  @IsOptional()
  @IsEnum(['text', 'html'])
  bodyType?: 'text' | 'html'

  @ApiPropertyOptional() @IsOptional() @IsString() renderer?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  templateId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  identityId?: string

  @ApiPropertyOptional({ type: [NotifyAttachment] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotifyAttachment)
  attachments?: NotifyAttachment[]

  @ApiPropertyOptional({
    description: 'Datetime for delayed send (ISO 8601, RFC 2822, or other standard formats)',
  })
  @IsOptional()
  @IsValidDateString()
  delayedSend?: string

  @ApiPropertyOptional({ enum: ['low', 'normal', 'high'] })
  @IsOptional()
  @IsEnum(['low', 'normal', 'high'])
  priority?: 'low' | 'normal' | 'high'

  @ApiPropertyOptional() @IsOptional() @IsString() encoding?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>
}
