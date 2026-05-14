import { ApiProperty } from '@nestjs/swagger'

/**
 * ClientTenantMappingDto
 *
 * Response schema representing a single client-tenant mapping.
 * Returned when a mapping is created, retrieved, or modified.
 */
export class ClientTenantMappingDto {
  @ApiProperty({
    description: 'Unique identifier for this mapping record',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string

  @ApiProperty({
    description: 'API Gateway client ID',
    example: 'abc123def456',
  })
  client_id: string

  @ApiProperty({
    description: 'CSTAR tenant ID this client can access',
    example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  })
  tenant_id: string

  @ApiProperty({
    description: 'Whether this mapping is currently active (client can access tenant)',
    example: true,
  })
  is_active: boolean

  @ApiProperty({
    description: 'ISO timestamp when the mapping was created',
    example: '2026-05-06T14:30:00Z',
  })
  created_at: string

  @ApiProperty({
    description: 'User GUID of the admin who created this mapping',
    example: 'admin-user@bcgov.ca',
  })
  created_by: string

  @ApiProperty({
    description: 'ISO timestamp when the mapping was last updated',
    example: '2026-05-06T14:30:00Z',
  })
  updated_at: string

  @ApiProperty({
    description: 'User GUID of the admin who last updated this mapping',
    example: 'admin-user@bcgov.ca',
    nullable: true,
  })
  updated_by: string | null

  @ApiProperty({
    description: 'Soft delete flag - whether this mapping has been deleted',
    example: false,
  })
  is_deleted: boolean
}
