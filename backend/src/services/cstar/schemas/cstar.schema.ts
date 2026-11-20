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

/** The SSO identity behind a CSTAR tenant user */
export class CstarSsoUserDto {
  @ApiProperty({ description: 'SSO user ID (IDIR or BCeID GUID)' })
  ssoUserId: string

  @ApiProperty({ description: 'First name' })
  firstName: string

  @ApiProperty({ description: 'Last name' })
  lastName: string

  @ApiProperty({ description: 'Display name' })
  displayName: string

  @ApiProperty({ description: 'Username', required: false })
  userName?: string

  @ApiProperty({ description: 'Email address', nullable: true, required: false })
  email?: string | null

  @ApiProperty({ description: 'Identity provider', enum: ['idir', 'bceidbusiness'] })
  idpType: 'idir' | 'bceidbusiness'
}

/** A CSTAR tenant role (TENANT_OWNER, USER_ADMIN, SERVICE_USER, ...) */
export class CstarTenantRoleDto {
  @ApiProperty({ description: 'Unique identifier for the role', format: 'uuid' })
  id: string

  @ApiProperty({ description: 'Role name' })
  name: string

  @ApiProperty({ description: 'Role description' })
  description: string
}

/**
 * A user's membership of a CSTAR tenant. groups, roles and sharedServices are present only
 * when requested through `expand` on GET tenants/{tenantId}/users/{tenantUserId}.
 */
export class CstarTenantUserDto {
  @ApiProperty({ description: 'Tenant user ID', format: 'uuid' })
  id: string

  @ApiProperty({ type: CstarSsoUserDto })
  ssoUser: CstarSsoUserDto

  @ApiProperty({ description: 'Date the user was added to the tenant' })
  createdDateTime: string

  @ApiProperty({ description: 'Date the tenant user was last updated' })
  updatedDateTime: string

  @ApiProperty({ type: [CstarGroupDto], required: false })
  groups?: CstarGroupDto[]

  @ApiProperty({ type: [CstarTenantRoleDto], required: false })
  roles?: CstarTenantRoleDto[]

  @ApiProperty({ description: 'Shared services granted through groups', required: false })
  sharedServices?: unknown[]
}

/**
 * A user from a BC Gov SSO IDIR or BCeID search. CSTAR passes these through from the SSO
 * API, so the identifying GUIDs live in `attributes` (idir_user_guid, bceid_user_guid, ...).
 */
export class CstarSsoSearchUserDto {
  @ApiProperty({ required: false })
  firstName?: string

  @ApiProperty({ required: false })
  lastName?: string

  @ApiProperty({ required: false })
  email?: string

  @ApiProperty({ description: 'SSO username, e.g. <guid>@idir' })
  username: string

  @ApiProperty({ description: 'SSO attributes, each a list of values' })
  attributes: Record<string, string[]>
}

/** A member of a CSTAR group, as returned to a service account */
export class CstarGroupMemberDto {
  @ApiProperty()
  firstName: string

  @ApiProperty()
  lastName: string

  @ApiProperty()
  displayName: string

  @ApiProperty({ nullable: true })
  email: string | null

  @ApiProperty({ enum: ['idir', 'bceidbusiness'] })
  idpType: 'idir' | 'bceidbusiness'
}

/** A user's membership of a CSTAR group. `id` is the groupUserId used to remove it. */
export class CstarGroupUserDto {
  @ApiProperty({ description: 'Group user ID', format: 'uuid' })
  id: string

  @ApiProperty({ type: CstarTenantUserDto, description: 'The tenant user in the group' })
  user: CstarTenantUserDto
}

/** A CSTAR group with its members, from GET groups/{groupId}?expand=groupUsers */
export class CstarGroupDetailDto extends CstarGroupDto {
  @ApiProperty({ type: [CstarGroupUserDto] })
  users: CstarGroupUserDto[]
}

/** One of a shared service's roles, and whether a group grants it */
export class CstarGroupSharedServiceRoleDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ description: 'Role name, e.g. NOTIFY_VIEWER' })
  name: string

  @ApiProperty({ required: false })
  description?: string

  @ApiProperty({ description: 'Whether the group grants this role' })
  enabled: boolean
}

/** A shared service and which of its roles a group grants */
export class CstarGroupSharedServiceDto {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty()
  name: string

  @ApiProperty()
  displayName: string

  @ApiProperty({ description: "The service's SSO client ID" })
  clientIdentifier: string

  @ApiProperty({ type: [CstarGroupSharedServiceRoleDto] })
  sharedServiceRoles: CstarGroupSharedServiceRoleDto[]
}

/** Request body for switching a group's shared service roles on or off */
export interface CstarGroupRolesUpdate {
  sharedServices: Array<{
    id: string
    sharedServiceRoles: Array<{ id: string; enabled: boolean }>
  }>
}
