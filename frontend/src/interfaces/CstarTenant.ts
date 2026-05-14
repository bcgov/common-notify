export interface Tenant {
  id: string
  name: string
  ministryName: string
  description?: string
  createdDateTime: string
  updatedDateTime: string
  createdBy: string
  updatedBy: string
  users: TenantUser[]
}

export interface TenantUser {
  id: string
  name?: string
  email?: string
  role?: string
}

export interface CstarTenantsResponse {
  data: {
    tenants: Tenant[]
  }
}
