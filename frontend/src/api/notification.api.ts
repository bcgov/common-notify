import type { AxiosError } from 'axios'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { NotificationStatus } from '@/enum/notification-status.enum'

interface PaginatedResponse {
  data: any[]
  count: number
  page: number
  limit: number
  totalPages: number
}

export const notificationApi = {
  /**
   * List all notification requests for the authenticated tenant
   * GET /api/v1/notification_request
   * @param status Optional status filter to apply on the backend
   */
  async listNotifications(status?: NotificationStatus | 'all') {
    try {
      const params = generateApiParameters('/api/v1/notification_request')
      const queryParams = status && status !== 'all' ? { status } : {}
      return await get({ ...params, params: queryParams })
    } catch (error) {
      const axiosError = error as AxiosError
      if (axiosError.response?.status === STATUS_CODES.NotFound) {
        // Return empty paginated response structure
        return {
          data: [],
          count: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        } as PaginatedResponse
      }
      throw new Error(
        `Failed to fetch notifications: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  },
}

export default notificationApi
