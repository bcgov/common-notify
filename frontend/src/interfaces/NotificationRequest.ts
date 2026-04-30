import type { NotifySimpleRequest } from './NotifyPayload'

export interface Tenant {
  id: string
  name: string
  slug: string
}

export interface NotificationRequest {
  id: string
  tenantId: string
  tenant?: Tenant
  status: string
  payload?: NotifySimpleRequest
  createdAt: string
  createdBy?: string
  updatedAt: string
  updatedBy?: string
  errorReason?: string
}
