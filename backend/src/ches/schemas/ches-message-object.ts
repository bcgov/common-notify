import {
  IsString,
  IsArray,
  IsEmail,
  IsOptional,
  IsNumber,
  IsEnum,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ChesAttachmentObject {
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string
  @ApiPropertyOptional() @IsOptional() @IsString() contentType?: string
  @ApiPropertyOptional({ enum: ['base64', 'binary', 'hex'] })
  @IsOptional()
  @IsEnum(['base64', 'binary', 'hex'])
  encoding?: string
  @ApiPropertyOptional() @IsOptional() @IsString() filename?: string
}

export class ChesMessageObject {
  @ApiProperty() @IsString() bodyType: string
  @ApiProperty() @IsString() body: string
  @ApiProperty() @IsEmail() from: string
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  to: string[]
  @ApiProperty() @IsString() subject: string

  @ApiPropertyOptional({ type: [ChesAttachmentObject] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChesAttachmentObject)
  attachments?: ChesAttachmentObject[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[]

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[]

  @ApiPropertyOptional() @IsOptional() @IsNumber() delayTS?: number

  @ApiPropertyOptional({ enum: ['base64', 'binary', 'hex', 'utf-8'] })
  @IsOptional()
  @IsEnum(['base64', 'binary', 'hex', 'utf-8'])
  encoding?: string

  @ApiPropertyOptional({ enum: ['normal', 'low', 'high'] })
  @IsOptional()
  @IsEnum(['normal', 'low', 'high'])
  priority?: string

  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string
}
