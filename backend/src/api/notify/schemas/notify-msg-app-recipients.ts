import { IsArray, IsString, ArrayMinSize } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class NotifyMsgAppRecipients {
  @ApiProperty({ type: [String], description: 'Message app recipient identifiers' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  to: string[]
}
