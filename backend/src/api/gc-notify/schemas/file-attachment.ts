import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsIn } from 'class-validator'

export class FileAttachment {
  @ApiProperty({
    description: 'File contents, base64 encoded.',
    example: 'JVBERi0xLjQKJcfsj6IK...',
  })
  @IsString()
  file: string

  @ApiProperty({
    description: 'Name the file is given on the message.',
    example: 'permit.pdf',
  })
  @IsString()
  filename: string

  @ApiProperty({
    description:
      'Whether the file rides on the message ("attach") or is replaced by a download link ("link").',
    enum: ['attach', 'link'],
    example: 'attach',
  })
  @IsIn(['attach', 'link'])
  sending_method: 'attach' | 'link'
}
