import type { AxiosError } from 'axios'
import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { NotificationStatus } from '@/enum/notification-status.enum'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
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
   * @param tenantId Required CSTAR external tenant ID to filter by
   * @param status Optional status filter to apply on the backend
   */
  async listNotifications(tenantId: string, status?: NotificationStatus | 'all') {
    try {
      const params = generateApiParameters('/api/v1/frontend/notification_request')
      const queryParams: any = {}
      queryParams.tenantId = tenantId
      if (status && status !== 'all') {
        queryParams.status = status
      }
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
   * Opens a persistent SSE connection that streams notification_request updates for the
   * authenticated tenant. Calls onMessage for each notification event received.
   *
   * Returns an AbortController — call abort() to close the connection.
   */
  connectNotificationStream(
    onMessage: (dto: NotificationRequest) => void,
    onError?: (err: unknown) => void,
    tenantId?: string,
  ): AbortController {
    const controller = new AbortController()
    const baseUrl = generateApiParameters('/api/v1/frontend/notification_request/events').url

    // Build URL with tenantId query parameter
    const url = tenantId ? `${baseUrl}?tenantId=${encodeURIComponent(tenantId)}` : baseUrl

    // Use the new async getToken() method which automatically refreshes when needed
    const fetchWithFreshToken = async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await UserService.getToken()
      return fetch(input, {
        ...init,
        headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
      })
    }

    fetchEventSource(url, {
      fetch: fetchWithFreshToken,
      signal: controller.signal,
      onmessage(event: EventSourceMessage) {
        if (event.event === 'keepalive' || !event.data) return
        try {
          const dto = JSON.parse(event.data) as NotificationRequest
          onMessage(dto)
        } catch (err) {
          console.error('Failed to parse SSE notification event', err)
        }
      },
      onerror(err: Error) {
        onError?.(err)
      },
    })

    return controller
  },
}

export default notificationApi
