import {
  IsString,
  IsArray,
  IsEmail,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsObject,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class NotifyAttachment {
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string
  @ApiPropertyOptional() @IsOptional() @IsString() contentType?: string
  @ApiPropertyOptional() @IsOptional() @IsString() filename?: string
  @ApiPropertyOptional() @IsOptional() @IsString() disposition?: string
}

export class NotifyEmailChannel {
  @ApiProperty({ type: [String] })
  @IsArray()
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

  @ApiPropertyOptional({ description: 'ISO 8601 datetime for delayed send' })
  @IsOptional()
  @IsDateString()
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
