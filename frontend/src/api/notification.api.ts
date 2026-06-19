import type { AxiosError } from 'axios'
import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { NotificationStatus } from '@/enum/notification-status.enum'
import type { NotificationRequestDetail } from '@/interfaces/NotificationRequest'
import type { PaginatedNotificationResponse } from '@/interfaces/PaginatedNotificationResponse'
import UserService from '@/service/user-service'

export interface ListNotificationsOptions {
  page?: number
  limit?: number
  status?: NotificationStatus | 'all'
}

export const notificationApi = {
  /**
   * List all notification requests for the authenticated tenant
   * GET /api/v1/frontend/notification_request
   * @param options Optional page, limit, and status filter values to apply on the backend
   */
  async listNotifications(options: ListNotificationsOptions = {}) {
    try {
      const params = generateApiParameters('/api/v1/frontend/notification_request')
      const queryParams = {
        ...(options.page ? { page: options.page } : {}),
        ...(options.limit ? { limit: options.limit } : {}),
        ...(options.status && options.status !== 'all' ? { status: options.status } : {}),
      }
      return await get<PaginatedNotificationResponse>({ ...params, params: queryParams })
    } catch (error) {
      const axiosError = error as AxiosError
      if (axiosError.response?.status === STATUS_CODES.NotFound) {
        // Return empty paginated response structure
        return {
          data: [],
          count: 0,
          page: options.page ?? 1,
          limit: options.limit ?? 10,
          totalPages: 0,
        } as PaginatedNotificationResponse
      }
      throw new Error(
        `Failed to fetch notifications: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  },

  /**
   * Fetch individual delivery records for a notification request.
   * GET /api/v1/frontend/notification_request/:id/request_details
   */
  async listRequestDetails(notificationRequestId: string): Promise<NotificationRequestDetail[]> {
    const params = generateApiParameters(
      `/api/v1/frontend/notification_request/request_details/${notificationRequestId}`,
    )
    return get<NotificationRequestDetail[]>(params)
  },

  /**
   * Fetch all delivery records for the authenticated tenant.
   * GET /api/v1/frontend/notification_request/request_details
   */
  async listAllRequestDetails(): Promise<NotificationRequestDetail[]> {
    const params = generateApiParameters('/api/v1/frontend/notification_request/request_details')
    return get<NotificationRequestDetail[]>(params)
  },

  /**
   * Opens a persistent SSE connection that streams refresh signals for the
   * authenticated tenant. Calls onMessage whenever a change event is received,
   * allowing the caller to refetch the current page of data.
   *
   * Returns an AbortController — call abort() to close the connection.
   */
  connectNotificationStream(
    onMessage: () => void,
    onError?: (err: unknown) => void,
    tenantId?: string,
  ): AbortController {
    const controller = new AbortController()
    const url = generateApiParameters('/api/v1/frontend/notification_request/events').url

    // Use the new async getToken() method which automatically refreshes when needed
    const fetchWithFreshToken = async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await UserService.getToken()
      return fetch(input, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
      })
    }

    fetchEventSource(url, {
      fetch: fetchWithFreshToken,
      signal: controller.signal,
      onmessage(event: EventSourceMessage) {
        if (event.event === 'keepalive') return
        onMessage()
      },
      onerror(err: Error) {
        onError?.(err)
      },
    })

    return controller
  },
}

export default notificationApi
