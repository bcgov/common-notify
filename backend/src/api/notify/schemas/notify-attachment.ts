import { IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class NotifyAttachment {
  @ApiProperty()
  @IsString({ message: 'Attachment filename is required and must be a string.' })
  @MinLength(1, { message: 'Attachment filename is required and must be a string.' })
  filename: string

  @ApiProperty()
  @IsString({ message: 'Attachment MIME type is required and must be a string.' })
  @MinLength(1, { message: 'Attachment MIME type is required and must be a string.' })
  mimeType: string

  @ApiProperty()
  @IsString({ message: 'Attachment content is required and must be a base64-encoded string.' })
  @MinLength(1, { message: 'Attachment content is required and must be a base64-encoded string.' })
  content: string
}
