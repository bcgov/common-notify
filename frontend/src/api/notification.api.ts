import type { AxiosError } from 'axios'
import axios from 'axios'
import { STATUS_CODES } from '@/common/api'

export const notificationApi = {
  /**
   * List all notification requests for the authenticated tenant
   * GET /api/v1/notifications
   */
  async listNotifications() {
    try {
      const response = await axios.get('/api/v1/notifications')
      return response.data
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

  /**
   * Get a notification request by ID
   * GET /api/v1/notifications/:id
   */
  async getNotification(id: string) {
    try {
      const response = await axios.get(`/api/v1/notifications/${id}`)
      return response.data
    } catch (error) {
      const axiosError = error as AxiosError
      if (axiosError.response?.status === STATUS_CODES.NotFound) {
        return null
      }
      throw new Error(
        `Failed to fetch notification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  },
}

export default notificationApi
