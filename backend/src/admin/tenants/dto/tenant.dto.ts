import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class TenantDto {
  @ApiProperty({
    description: 'Unique identifier for the tenant',
  })
  id: string

  @ApiPropertyOptional({
    description: 'External identifier from CSTAR or Gateway',
  })
  externalId?: string

  @ApiProperty({
    description: 'Human-readable name of the tenant organization',
  })
  name: string

  @ApiProperty({
    description: 'URL-friendly unique identifier for the tenant',
  })
  slug: string

  @ApiProperty({
    enum: ['active', 'disabled'],
    description: 'Current status of the tenant',
  })
  status: string

  @ApiProperty({
    description: 'Timestamp when the tenant record was created',
  })
  createdAt: Date

  @ApiPropertyOptional({
    description: 'Identifier of the user or process that created this record',
  })
  createdBy?: string

  @ApiProperty({
    description: 'Timestamp when the tenant record was last updated',
  })
  updatedAt: Date

  @ApiPropertyOptional({
    description: 'Identifier of the user or process that last updated this record',
  })
  updatedBy?: string

  @ApiProperty({
    description: 'Soft delete flag. When true, the tenant is considered inactive.',
  })
  isDeleted: boolean
}
