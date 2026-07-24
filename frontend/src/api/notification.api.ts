import type { AxiosError } from 'axios'
import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { get, generateApiParameters, STATUS_CODES } from '@/common/api'
import type {
  NotificationRequest,
  NotificationRequestDetail,
} from '@/interfaces/NotificationRequest'
import type {
  PaginatedNotificationResponse,
  PaginatedNotificationDetailResponse,
} from '@/interfaces/PaginatedNotificationResponse'
import UserService from '@/service/user-service'

export interface ListNotificationsOptions {
  page?: number
  limit?: number
  sort?: string
  filter?: string[]
}

export interface ListRequestDetailsOptions extends ListNotificationsOptions {
  search?: string
}

export const notificationApi = {
  /**
   * List all notification requests for the authenticated tenant
   * GET /api/v1/frontend/notification_request
   * @param options Optional page, limit, and status filter values to apply on the backend
   */
  async listNotifications(options: ListNotificationsOptions = {}) {
    try {
      const qs = new URLSearchParams()
      if (options.page) qs.set('page', String(options.page))
      if (options.limit) qs.set('limit', String(options.limit))
      if (options.sort) qs.set('sort', options.sort)
      if (options.filter && options.filter.length > 0)
        options.filter.forEach((f) => qs.append('filter', f))
      const params = generateApiParameters(`/api/v1/frontend/notification_request?${qs.toString()}`)
      return await get<PaginatedNotificationResponse>(params)
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
   * Fetch a single notification request (the parent of the delivery records).
   * GET /api/v1/frontend/notification_request/:id
   */
  async getNotification(notificationRequestId: string): Promise<NotificationRequest> {
    const params = generateApiParameters(
      `/api/v1/frontend/notification_request/${notificationRequestId}`,
    )
    return await get<NotificationRequest>(params)
  },

  /**
   * Fetch individual delivery records for a notification request.
   * Sorting, filtering, search, and pagination are all applied on the backend.
   * GET /api/v1/frontend/notification_request/request_details/:id
   */
  async listRequestDetails(
    notificationRequestId: string,
    options: ListRequestDetailsOptions = {},
  ): Promise<PaginatedNotificationDetailResponse> {
    try {
      const qs = new URLSearchParams()
      if (options.page) qs.set('page', String(options.page))
      if (options.limit) qs.set('limit', String(options.limit))
      if (options.search) qs.set('search', options.search)
      if (options.sort) qs.set('sort', options.sort)
      if (options.filter && options.filter.length > 0)
        options.filter.forEach((f) => qs.append('filter', f))
      const params = generateApiParameters(
        `/api/v1/frontend/notification_request/request_details/${notificationRequestId}?${qs.toString()}`,
      )
      return await get<PaginatedNotificationDetailResponse>(params)
    } catch (error) {
      const axiosError = error as AxiosError
      if (axiosError.response?.status === STATUS_CODES.NotFound) {
        return {
          data: [],
          count: 0,
          page: options.page ?? 1,
          limit: options.limit ?? 15,
          totalPages: 0,
        }
      }
      throw new Error(
        `Failed to fetch notification details: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
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
