import { ApiProperty } from '@nestjs/swagger'

/**
 * Tenant DTO for API responses
 * Includes only necessary fields for notification context
 */
export class TenantDto {
  @ApiProperty({
    description: 'Unique identifier for the tenant.',
    format: 'uuid',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  id: string

  @ApiProperty({ description: 'Tenant name.', example: 'Ministry of Citizens Services' })
  name: string

  @ApiProperty({
    description: 'URL-friendly form of the tenant name.',
    example: 'citizens-services',
  })
  slug: string
}
