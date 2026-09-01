import { IsBoolean } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateSmsSettingsDto {
  @ApiProperty({ description: 'When false, the tenant cannot send SMS notifications' })
  @IsBoolean()
  smsNotificationsEnabled: boolean

  @ApiProperty({ description: 'When true, SMS messages are prefixed with the tenant name' })
  @IsBoolean()
  includeTenantNameInSms: boolean

  @ApiProperty({ description: 'When true, the tenant may send SMS to international numbers' })
  @IsBoolean()
  internationalSmsEnabled: boolean
}
