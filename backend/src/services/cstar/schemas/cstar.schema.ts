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

/**
 * A CSTAR group within a tenant, as returned by GET /v1/tenants/{tenantId}/groups
 */
export class CstarGroupDto {
  @ApiProperty({ description: 'Unique identifier for the group', format: 'uuid' })
  id: string

  @ApiProperty({ description: 'Group name' })
  name: string

  @ApiProperty({ description: 'Group description', nullable: true })
  description?: string | null
}

/**
 * Response from CSTAR API for a tenant's groups
 */
export class CstarGroupsResponseDto {
  @ApiProperty({ type: [CstarGroupDto], description: 'Array of groups belonging to the tenant' })
  data: {
    groups: CstarGroupDto[]
  }
}

/**
 * Response from CSTAR API for a tenant's users, optionally filtered to a set of groups.
 *
 * The email address lives on the nested SSO user. Both levels are optional here because a
 * tenant user can be present without a resolvable SSO user, and the SSO user's email is
 * itself nullable in CSTAR.
 */
export class CstarTenantUsersResponseDto {
  @ApiProperty({ description: 'The tenant users matching the request' })
  data: {
    users?: Array<{
      ssoUser?: {
        email?: string | null
      } | null
    }>
  }
}
