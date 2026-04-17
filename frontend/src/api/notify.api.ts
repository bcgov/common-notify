import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'
import UserService from '@/service/user-service'

/**
 * Centralized API abstraction layer for Notify API endpoints.
 * All API calls should be centralized here, not scattered in components.
 *
 * Components should call Redux actions/thunks instead of making API calls directly.
 */

// HTTP status codes
const STATUS_CODES = {
  Ok: 200,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
  Conflict: 409,
}

/**
 * Configure axios interceptors for auth error handling
 */
const configureAxios = () => {
  // Request interceptor: Add auth token to all requests
  axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = UserService.getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  // Response interceptor: Handle auth errors globally
  axios.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const { response } = error
      if (response && response.status === STATUS_CODES.Unauthorized) {
        // 401 = unauthenticated: redirect to Keycloak login
        UserService.doLogin()
      } else if (response && response.status === STATUS_CODES.Forbidden) {
        // 403 = authenticated but lacks permission
        globalThis.location.href = '/not-authorized'
      }
      return Promise.reject(error)
    },
  )
}

// Configure on module load
configureAxios()

export const notifyApi = {
  /**
   * Send a simple notification
   * POST /api/v1/notifysimple
   */
  async sendSimpleNotify(payload: {
    email?: { to: string[]; subject: string; body: string }
    sms?: { to: string[]; body: string }
  }) {
    try {
      const response = await axios.post('/api/v1/notifysimple', payload, {
        headers: {
          'Content-Type': 'application/json',
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
