import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsUUID,
  IsObject,
  ArrayMinSize,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidDateString } from './validators/date-string.validator'

export class NotifyMsgAppChannel {
  @ApiProperty({ type: [String], description: 'Message app recipients' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  recipients: string[]

  @ApiPropertyOptional() @IsOptional() @IsString() from?: string

  @ApiPropertyOptional() @IsOptional() @IsString() msgAppId?: string

  @ApiProperty() @IsString() body: string

  @ApiPropertyOptional() @IsOptional() @IsString() renderer?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  templateId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  identityId?: string

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
