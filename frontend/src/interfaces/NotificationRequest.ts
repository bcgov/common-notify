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

export interface NotificationStatusCode {
  code: string
  displayName: string
  description?: string
}

export interface NotificationRequest {
  id: string
  tenantId: string
  tenant?: Tenant
  status: NotificationStatusCode
  channelCode?: string
  channel?: NotificationChannel
  requestRoute?: string
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

export interface NotificationRequestDetail {
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
