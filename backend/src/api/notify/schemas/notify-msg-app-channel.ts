import { IsString, IsArray, IsOptional, IsUUID, IsObject, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiSchema, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsFutureDateString } from './validators/date-string.validator'
import { ValidateTemplateOrRenderer } from './validators/template-or-renderer.validator'
import { NotifyAttachment } from './notify-attachment'
import { NotifyMsgAppRecipients } from './notify-msg-app-recipients'
import { NotifyContent } from './notify-content'

@ApiSchema({ description: 'Send by messaging app.' })
@ValidateTemplateOrRenderer()
export class NotifyMsgAppChannel {
  @ApiProperty({ description: 'Message app recipients', type: NotifyMsgAppRecipients })
  @ValidateNested()
  @Type(() => NotifyMsgAppRecipients)
  recipients: NotifyMsgAppRecipients

  @ApiProperty({ description: 'Message app content', type: NotifyContent })
  @ValidateNested()
  @Type(() => NotifyContent)
  content: NotifyContent

  @ApiPropertyOptional({ type: [NotifyAttachment] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotifyAttachment)
  attachments?: NotifyAttachment[]

  @ApiPropertyOptional() @IsOptional() @IsString() from?: string

  @ApiPropertyOptional() @IsOptional() @IsString() msgAppId?: string

  @ApiPropertyOptional({
    description: 'Datetime for delayed send (ISO 8601, RFC 2822, or other standard formats)',
    example: '2027-06-01T16:00:00Z',
  })
  @IsOptional()
  @IsFutureDateString()
  delayedSend?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  identityId?: string
}
