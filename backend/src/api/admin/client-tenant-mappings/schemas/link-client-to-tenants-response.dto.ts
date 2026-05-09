import { ApiProperty } from '@nestjs/swagger'
import { ClientTenantMappingDto } from './client-tenant-mapping.dto'

/**
 * LinkClientToTenantsResponseDto
 *
 * Response schema returned when successfully linking a client to tenants.
 * Contains the created or reactivated mapping records.
 */
export class LinkClientToTenantsResponseDto {
  @ApiProperty({
    description: 'Array of created or reactivated client-tenant mappings',
    type: [ClientTenantMappingDto],
  })
  mappings: ClientTenantMappingDto[]

  @ApiProperty({
    description: 'Human-readable success message',
    example: 'Successfully linked client abc123def456 to 2 tenants',
  })
  message: string

  @ApiProperty({
    description: 'Number of mappings created or reactivated',
    example: 2,
  })
  count: number
}
