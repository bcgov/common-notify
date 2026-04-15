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
      const { response, config } = error

      // Only redirect to login if there's truly no token (not just API rejection)
      if (response && response.status === STATUS_CODES.Unauthorized) {
        const token = UserService.getToken()

        if (!token) {
          // No token at all: redirect to Keycloak login
          UserService.doLogin()
        } else if (config?.url?.startsWith('/api')) {
          // API call with valid token was rejected: let it propagate as error
          // so Redux/component can show error toast instead of redirecting
          return Promise.reject(error)
        } else {
          // Non-API request was rejected: redirect to login
          UserService.doLogin()
        }
      } else if (response && response.status === STATUS_CODES.Forbidden) {
        // 403 = authenticated but lacks permission.  Handles the case where user has a token but the gateway rejects it due to missing role/permission. Redirect to a "Not Authorized" page instead of login.
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
      // Just send the request - axios interceptor adds Authorization header with Bearer token
      const response = await axios.post('/api/v1/notifysimple', payload)
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
