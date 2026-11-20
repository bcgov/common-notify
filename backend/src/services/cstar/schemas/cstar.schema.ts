import { ApiProperty } from '@nestjs/swagger'

/**
 * Individual role object from CSTAR API
 */
export class CstarRoleDto {
  @ApiProperty({ description: 'Unique identifier for the role', format: 'uuid' })
  id: string

  @ApiProperty({
    description: 'Role name (e.g., NOTIFY_OPERATIONS_ADMIN, NOTIFY_TEMPLATE_EDITOR, NOTIFY_VIEWER)',
  })
  name: string

  @ApiProperty({ description: 'Human-readable role description' })
  description: string

  @ApiProperty({ description: 'Date role was created' })
  createdDateTime: string

  @ApiProperty({ description: 'Date role was last updated' })
  updatedDateTime: string

  @ApiProperty({ description: 'User who created the role', nullable: true })
  createdBy: string | null

  @ApiProperty({ description: 'User who last updated the role', nullable: true })
  updatedBy: string | null
}

/**
 * Response from CSTAR API for user roles in a tenant
 */
export class CstarRolesResponseDto {
  @ApiProperty({
    type: [CstarRoleDto],
    description: 'Array of shared service roles assigned to user in tenant',
  })
  data: {
    sharedServiceRoles: CstarRoleDto[]
  }
}

/**
 * Cached CSTAR role data with expiration
 */
export class CstarRoleCache {
  roles: string[]
  expiresAt: number
}

/**
 * Individual tenant object from CSTAR API
 */
export class CstarTenantDto {
  @ApiProperty({ description: 'Unique identifier for the tenant (GUID)', format: 'uuid' })
  id: string

  @ApiProperty({ description: 'Tenant name' })
  name: string

  @ApiProperty({ description: 'Ministry name', nullable: true })
  ministryName?: string | null

  @ApiProperty({ description: 'Tenant description', nullable: true })
  description?: string | null

  @ApiProperty({ description: 'Date tenant was created' })
  createdDateTime: string

  @ApiProperty({ description: 'Date tenant was last updated' })
  updatedDateTime: string

  @ApiProperty({ description: 'User who created the tenant', nullable: true })
  createdBy?: string | null

  @ApiProperty({ description: 'User who last updated the tenant', nullable: true })
  updatedBy?: string | null
}

/**
 * Response from CSTAR API for user's tenants
 */
export class CstarTenantsResponseDto {
  @ApiProperty({ type: [CstarTenantDto], description: 'Array of tenants accessible to user' })
  data: {
    tenants: CstarTenantDto[]
  }
}
