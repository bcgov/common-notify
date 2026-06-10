import { IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class NotifyAttachment {
  @ApiProperty()
  @IsString()
  filename: string

  @ApiProperty()
  @IsString()
  mimeType: string

  @ApiProperty()
  @IsString()
  content: string
}
