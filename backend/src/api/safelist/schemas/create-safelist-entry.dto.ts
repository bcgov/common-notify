import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationChannel } from '../../../enum/notification-channel.enum'

export class CreateSafelistEntryDto {
  @ApiProperty({
    enum: NotificationChannel,
    description: 'Channel this recipient may be sent to. Safelisting is per channel.',
  })
  @IsEnum(NotificationChannel)
  channelCode: NotificationChannel

  @ApiProperty({
    description: 'Email address or phone number that may receive notifications',
    example: 'qa.mailbox@gov.bc.ca',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  recipient: string

  @ApiPropertyOptional({
    description: 'Optional note describing what this recipient is for',
    example: 'QA mailbox',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null
}
