import { IsString, IsOptional, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateTenantDto {
  @ApiPropertyOptional({
    description:
      'External identifier from CSTAR or Gateway used to correlate this tenant with external systems',
    example: 'ext-12345',
  })
  @IsOptional()
  @IsString()
  externalId?: string

  @ApiProperty({
    description: 'Human-readable name of the tenant organization',
    example: 'Ministry of Health',
  })
  @IsString()
  name: string

  @ApiPropertyOptional({
    description:
      'URL-friendly unique identifier for the tenant. Must be unique across all tenants. If not provided, will be auto-generated from the name.',
    example: 'ministry-of-health',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string

  @ApiPropertyOptional({
    description: 'Identifier of the user or process creating this record',
    example: 'user@bcgov.ca',
  })
  @IsOptional()
  @IsString()
  createdBy?: string
}
