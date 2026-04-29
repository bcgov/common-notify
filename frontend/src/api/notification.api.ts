import type { AxiosError } from 'axios'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'

export const notificationApi = {
  /**
   * List all notification requests for the authenticated tenant
   * GET /api/v1/notification_request
   */
  async listNotifications() {
    try {
      const params = generateApiParameters('/api/v1/notification_request')
      return await get(params)
    } catch (error) {
      const axiosError = error as AxiosError
      if (axiosError.response?.status === STATUS_CODES.NotFound) {
        return []
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
