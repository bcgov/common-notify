import { IsArray, IsString, ArrayMinSize } from 'class-validator'
import { ApiSchema, ApiProperty } from '@nestjs/swagger'

@ApiSchema({
  description: 'Message app recipients.',
})
export class NotifyMsgAppRecipients {
  @ApiProperty({ type: [String], description: 'Message app recipient identifiers' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  to: string[]
}
