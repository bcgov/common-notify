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

export interface NotificationDelivery {
  id: string
  notificationRequestId: string
  recipientAddress: string
  channel: string
  status: string
  providerResponseId?: string
  errorMessage?: string
  attemptCount: number
  lastAttemptAt?: string
  createdAt: string
  updatedAt: string
}
