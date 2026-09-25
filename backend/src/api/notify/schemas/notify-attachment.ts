import { IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class NotifyAttachment {
  @ApiProperty({
    description: 'Name the file is given on the message.',
    example: 'permit.pdf',
  })
  @IsString({ message: 'Attachment filename is required and must be a string.' })
  @MinLength(1, { message: 'Attachment filename is required and must be a string.' })
  filename: string

  @ApiProperty({
    description: 'MIME type of the file.',
    example: 'application/pdf',
  })
  @IsString({ message: 'Attachment MIME type is required and must be a string.' })
  @MinLength(1, { message: 'Attachment MIME type is required and must be a string.' })
  mimeType: string

  @ApiProperty({
    description: 'File contents, base64 encoded.',
    example: 'JVBERi0xLjQKJcfsj6IK...',
  })
  @IsString({ message: 'Attachment content is required and must be a base64-encoded string.' })
  @MinLength(1, { message: 'Attachment content is required and must be a base64-encoded string.' })
  content: string
}
