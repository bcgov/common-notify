export interface Tenant {
  id: string
  name: string
  slug: string
  status: string
  externalId?: string
  createdAt: Date
  createdBy?: string
  updatedAt: Date
  updatedBy?: string
  isDeleted: boolean
}
