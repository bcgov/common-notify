import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class NotifyMsgAppChannel {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  to: string[]

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
