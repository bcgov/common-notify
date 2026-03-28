import { IsString, IsEmail, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateTenantDto {
  @ApiProperty({
    description: 'Unique tenant name (will be used as Kong consumer username)',
    example: 'bchealth-notifications',
  })
  @IsString()
  name: string

  @ApiPropertyOptional({
    description: 'Human-readable description of the tenant',
    example: 'BC Health Notifications Service',
  })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({
    description: 'Organization name',
    example: 'BC Ministry of Health',
  })
  @IsOptional()
  @IsString()
  organization?: string

  @ApiPropertyOptional({
    description: 'Contact email for the tenant administrator',
    example: 'admin@bchealth.ca',
  })
  @IsOptional()
  @IsEmail()
  contactEmail?: string

  @ApiPropertyOptional({
    description: 'Contact name for the tenant administrator',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  contactName?: string
}
