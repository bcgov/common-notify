import { IsBoolean, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

/** Enables or disables sending for a tenant. Admin-only (NOTIFY_ADMIN). */
export class SetTenantSendingDto {
  @ApiProperty({ description: 'Whether the tenant may send notifications' })
  @IsBoolean()
  enabled: boolean

  @ApiProperty({
    description: 'Why sending is being disabled. Required when disabling; ignored when enabling.',
    required: false,
    maxLength: 500,
  })
  @ValidateIf((dto: SetTenantSendingDto) => dto.enabled === false)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'A reason is required to disable sending' })
  @MaxLength(500)
  reason?: string
}
