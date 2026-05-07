import type { AxiosError } from 'axios'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { NotificationStatus } from '@/enum/notification-status.enum'
import type { NotificationRequest, NotificationDelivery } from '@/interfaces/NotificationRequest'
import UserService from '@/service/user-service'

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
   * GET /api/v1/frontend/notification_request
   * @param status Optional status filter to apply on the backend
   */
  async listNotifications(status?: NotificationStatus | 'all') {
    try {
      const params = generateApiParameters('/api/v1/frontend/notification_request')
      const queryParams = status && status !== 'all' ? { status } : {}
      return await get<PaginatedResponse>({ ...params, params: queryParams })
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

  /**
   * Fetch individual delivery records for a notification request
   * GET /api/v1/frontend/notification_request/:id/deliveries
   */
  async listDeliveries(notificationRequestId: string): Promise<NotificationDelivery[]> {
    const params = generateApiParameters(
      `/api/v1/frontend/notification_request/${notificationRequestId}/deliveries`,
    )
    return get<NotificationDelivery[]>(params)
  },

  /**
   * DEBUG: Fetch all delivery records across all notification requests.
   * GET /api/v1/frontend/notification_request/debug/deliveries
   * Remove when per-request filtering is confirmed working.
   */
  async listDeliveriesDebug(): Promise<NotificationDelivery[]> {
    const params = generateApiParameters('/api/v1/frontend/notification_request/debug/deliveries')
    return get<NotificationDelivery[]>(params)
  },

  /**
   * Opens a persistent SSE connection that streams notification_request updates for the
   * authenticated tenant. Calls onMessage for each notification event received.
   *
   * Returns an AbortController — call abort() to close the connection.
   */
  connectNotificationStream(
    onMessage: (dto: NotificationRequest) => void,
    onError?: (err: unknown) => void,
  ): AbortController {
    const controller = new AbortController()

    // Use the new async getToken() method which automatically refreshes when needed
    const fetchWithFreshToken = async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await UserService.getToken()
      return fetch(input, {
        ...init,
        headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
      })
    }

    fetchEventSource('/api/v1/frontend/notification_request/events', {
      fetch: fetchWithFreshToken,
      signal: controller.signal,
      onmessage(event) {
        if (event.event === 'keepalive' || !event.data) return
        try {
          const dto = JSON.parse(event.data) as NotificationRequest
          onMessage(dto)
        } catch (err) {
          console.error('Failed to parse SSE notification event', err)
        }
      },
      onerror(err) {
        onError?.(err)
      },
    })

    return controller
  },
}

export default notificationApi
