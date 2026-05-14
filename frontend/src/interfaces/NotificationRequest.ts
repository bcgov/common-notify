import type { NotifySimpleRequest } from './NotifyPayload'

export interface Tenant {
  id: string
  name: string
  slug: string
}

export interface NotificationChannel {
  channelCode: string
  displayName: string
  description?: string
}

export interface NotificationRequest {
  id: string
  tenantId: string
  tenant?: Tenant
  status: string
  channelCode?: string
  channel?: NotificationChannel
  delayedSendTime?: string
  recipients?: {
    email?: string[]
    sms?: string[]
    msgApp?: string[]
  }
  payload?: NotifySimpleRequest
  createdAt: string
  createdBy?: string
  updatedAt: string
  updatedBy?: string
  errorReason?: string
}
