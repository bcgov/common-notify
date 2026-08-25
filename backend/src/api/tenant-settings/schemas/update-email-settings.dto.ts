import { IsBoolean, Matches, ValidateIf } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateEmailSettingsDto {
  @ApiProperty({ description: 'When false, the tenant cannot send email notifications' })
  @IsBoolean()
  emailNotificationsEnabled: boolean

  @ApiProperty({
    description:
      'Local part (before @gov.bc.ca) of the reply-to email address. Optional. 1-64 characters using letters, numbers, periods, hyphens, and underscores.',
    nullable: true,
  })
  @ValidateIf((_object, value) => value !== null)
  @Matches(/^[A-Za-z0-9._-]{1,64}$/, {
    message:
      'replyToEmail must be 1-64 characters using letters, numbers, periods (.), hyphens (-), and underscores (_)',
  })
  replyToEmail: string | null

  @ApiProperty({
    description: 'When true, the tenant may send email notifications with attachments',
  })
  @IsBoolean()
  emailAttachmentsEnabled: boolean
}
