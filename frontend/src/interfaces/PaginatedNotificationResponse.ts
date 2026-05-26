import type { NotificationRequest } from './NotificationRequest'
import type { TemplateResponse } from '@/api/templates.api'

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  limit: number
  totalPages: number
}

export type PaginatedNotificationResponse = PaginatedResponse<NotificationRequest>
export type PaginatedTemplateResponse = PaginatedResponse<TemplateResponse>
