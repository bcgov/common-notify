import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsObject,
  ArrayMinSize,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class NotifySmsChannel {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  to: string[]

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
