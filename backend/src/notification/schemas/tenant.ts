import { ApiProperty } from '@nestjs/swagger'

/**
 * Tenant DTO for API responses
 * Includes only necessary fields for notification context
 */
export class TenantDto {
  @ApiProperty({ description: 'Unique identifier for the tenant', format: 'uuid' })
  id: string

  @ApiProperty({ description: 'Tenant name' })
  name: string

  @ApiProperty({ description: 'Tenant slug (URL-friendly identifier)' })
  slug: string
}
