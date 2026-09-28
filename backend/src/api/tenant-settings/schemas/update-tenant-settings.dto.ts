import { IsEmail, IsNotEmpty, Matches, ValidateIf } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateTenantSettingsDto {
  @ApiProperty({
    description: 'Email address that receives system and limit alerts for the tenant',
    nullable: true,
  })
  @ValidateIf((_object, value) => value !== null)
  @IsEmail()
  alertEmail: string | null

  @ApiProperty({
    description:
      'Local part (before @gov.bc.ca) of the default sending email address. Required. 1-64 characters using letters, numbers, periods, hyphens, and underscores.',
  })
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/, {
    message:
      'defaultSenderEmail must be 1-64 characters using letters, numbers, periods (.), hyphens (-), and underscores (_)',
  })
  defaultSenderEmail: string
}
