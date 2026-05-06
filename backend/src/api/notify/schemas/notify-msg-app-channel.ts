import { IsString, IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidDateString } from './validators/date-string.validator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { NotifyMsgAppRecipients } from './notify-msg-app-recipients'
import { NotifyContent } from './notify-content'

@ValidateTemplateOrRenderer()
export class NotifyMsgAppChannel {
  @ApiProperty({ type: NotifyMsgAppRecipients, description: 'Message app recipients' })
  @ValidateNested()
  @Type(() => NotifyMsgAppRecipients)
  recipients: NotifyMsgAppRecipients

  @ApiProperty({ type: NotifyContent, description: 'Message app content' })
  @ValidateNested()
  @Type(() => NotifyContent)
  content: NotifyContent

  @ApiPropertyOptional() @IsOptional() @IsString() from?: string

  @ApiPropertyOptional() @IsOptional() @IsString() msgAppId?: string

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
