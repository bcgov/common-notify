import type { InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'
import UserService from '@/service/user-service'
import type { NotifySimpleRequest } from '@/interfaces/NotifyPayload'

/**
 * Centralized API abstraction layer for Notify API endpoints.
 * All API calls should be centralized here, not scattered in components.
 *
 * Components should call Redux actions/thunks instead of making API calls directly.
 */

/**
 * Configure axios interceptors for auth error handling
 */
let requestInterceptorConfigured = false

const configureAxios = () => {
  // Request interceptor: Add auth token to all requests (register only once)
  // Response interceptor is handled globally in @/common/api to avoid duplicate handlers
  if (!requestInterceptorConfigured) {
    axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const token = UserService.getToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })
    requestInterceptorConfigured = true
  }
}

// Configure on module load
configureAxios()

export const notifyApi = {
  /**
   * Send a simple notification
   * POST /api/v1/notifysimple
   */
  async sendSimpleNotify(payload: NotifySimpleRequest) {
    try {
      // Send request with X-Realm header to route to user auth path
      const response = await axios.post('/api/v1/notifysimple', payload, {
        headers: {
          'X-Realm': 'standard',
        },
      })
      return response.data
    } catch (error) {
      throw new Error(
        `Failed to send notification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  },

  /**
   * Get notification status
   * GET /api/v1/notify/status/:notifyId
   */
  async getNotificationStatus(notifyId: string) {
    try {
      const response = await axios.get(`/api/v1/notify/status/${notifyId}`)
      return response.data
    } catch (error) {
      throw new Error(
        `Failed to fetch notification status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  },

  /**
   * List notifications
   * GET /api/v1/notify
   */
  async listNotifications(params?: { limit?: string; cursor?: string; status?: string }) {
    try {
      const response = await axios.get('/api/v1/notify', {
        params,
      })
      return response.data
    } catch (error) {
      throw new Error(
        `Failed to fetch notifications: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  },
}

export default notifyApi
