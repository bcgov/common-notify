import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsArray,
  IsEmail,
  IsOptional,
  IsNumber,
  ValidateNested,
  IsObject,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ChesAttachmentObject } from './ches-message-object'

export class ChesContextObject {
  @ApiProperty() @IsObject() context: Record<string, unknown>
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEmail({}, { each: true })
  to: string[]
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  bcc?: string[]
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  cc?: string[]
  @ApiPropertyOptional() @IsOptional() @IsNumber() delayTS?: number
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string
}

export class ChesMergeRequest {
  @ApiProperty({ enum: ['html', 'text'] }) @IsString() bodyType: string
  @ApiProperty() @IsString() body: string
  @ApiProperty({ type: [ChesContextObject] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChesContextObject)
  contexts: ChesContextObject[]
  @ApiProperty() @IsString() from: string
  @ApiProperty() @IsString() subject: string
  @ApiPropertyOptional({ type: [ChesAttachmentObject] })
  @IsOptional()
  @IsArray()
  attachments?: ChesAttachmentObject[]
  @ApiPropertyOptional({ enum: ['base64', 'binary', 'hex', 'utf-8'] })
  @IsOptional()
  @IsString()
  encoding?: string
  @ApiPropertyOptional({ enum: ['normal', 'low', 'high'] })
  @IsOptional()
  @IsString()
  priority?: string
}
