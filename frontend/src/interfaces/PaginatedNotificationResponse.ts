import type { NotificationRequest } from './NotificationRequest'

export interface PaginatedNotificationResponse {
  data: NotificationRequest[]
  count: number
  page: number
  limit: number
  totalPages: number
}
