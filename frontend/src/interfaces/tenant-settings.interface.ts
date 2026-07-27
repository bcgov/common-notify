export interface TenantSettings {
  id: string
  tenantId: string
  alertEmail: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  isDeleted: boolean
}
