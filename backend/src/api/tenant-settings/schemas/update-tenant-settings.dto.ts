import { IsEmail, ValidateIf } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateTenantSettingsDto {
  @ApiProperty({
    description: 'Email address that receives system and limit alerts for the tenant',
    nullable: true,
  })
  @ValidateIf((_object, value) => value !== null)
  @IsEmail()
  alertEmail: string | null
}
