import { IsString, IsArray, IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidDateString } from './validators/date-string.validator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { NotifyEmailRecipients } from './notify-email-recipients'
import { NotifyContent } from './notify-content'

export class NotifyAttachment {
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string
  @ApiPropertyOptional() @IsOptional() @IsString() contentType?: string
  @ApiPropertyOptional() @IsOptional() @IsString() filename?: string
  @ApiPropertyOptional() @IsOptional() @IsString() disposition?: string
}

@ValidateTemplateOrRenderer()
export class NotifyEmailChannel {
  @ApiProperty({ type: NotifyEmailRecipients, description: 'Email recipients with to, cc, bcc' })
  @ValidateNested()
  @Type(() => NotifyEmailRecipients)
  recipients: NotifyEmailRecipients

  @ApiPropertyOptional({ type: NotifyContent, description: 'Email content (subject, body, etc.)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotifyContent)
  content?: NotifyContent

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

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  templateId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  identityId?: string
}
