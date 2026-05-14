import { IsArray, IsString, ArrayMinSize } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class NotifySmsRecipients {
  @ApiProperty({ type: [String], description: 'Phone number recipients' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  to: string[]
}
