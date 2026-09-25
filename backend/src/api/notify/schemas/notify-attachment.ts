import { IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class NotifyAttachment {
  @ApiProperty({
    description:
      'Name the file is given on the message. Up to 255 characters by default ' +
      '(`attachment_max_filename_length`).',
    example: 'permit.pdf',
  })
  @IsString({ message: 'Attachment filename is required and must be a string.' })
  @MinLength(1, { message: 'Attachment filename is required and must be a string.' })
  filename: string

  @ApiProperty({
    description:
      'MIME type of the file. Must be one of the types this environment allows - by default ' +
      '`application/pdf`, `application/msword`, the OpenXML Word and Excel types, ' +
      '`application/vnd.ms-excel`, `application/zip`, `text/plain`, `text/csv`, `image/png`, ' +
      '`image/jpeg` and `image/gif`. The list is configurable per environment, so a type accepted ' +
      'in one may be rejected in another.',
    example: 'application/pdf',
  })
  @IsString({ message: 'Attachment MIME type is required and must be a string.' })
  @MinLength(1, { message: 'Attachment MIME type is required and must be a string.' })
  mimeType: string

  @ApiProperty({
    description:
      'File contents, base64 encoded. Up to 5 MB per attachment and 25 MB across the whole request ' +
      'by default (`attachment_max_size_mb` and `attachment_max_request_size_mb`); both are ' +
      'configurable per environment. Every attachment is virus scanned before delivery, so a ' +
      'rejected file fails after the request is accepted, not during it.',
    example: 'JVBERi0xLjQKJcfsj6IK...',
  })
  @IsString({ message: 'Attachment content is required and must be a base64-encoded string.' })
  @MinLength(1, { message: 'Attachment content is required and must be a base64-encoded string.' })
  content: string
}
