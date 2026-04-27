export interface NotificationRequest {
  id: string
  tenantId: string
  status: string
  payload?: Record<string, unknown>
  createdAt: string
  createdBy?: string
  updatedAt: string
  updatedBy?: string
  errorReason?: string
}
