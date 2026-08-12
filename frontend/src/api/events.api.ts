import type { AxiosError } from 'axios'
import { get, post, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { PaginatedEventResponse } from '@/interfaces/PaginatedNotificationResponse'

export enum EventStatus {
  ACTIVE = 'ACTIVE',
  DRAFT = 'DRAFT',
}

export interface EventResponse {
  id: string
  name: string
  description: string
  /** Channels the event notifies on; empty until a notification tab is configured. */
  channelCodes: string[]
  status: EventStatus
  createdAt: string
  updatedAt: string
}

/**
 * Notification Events API
 * Endpoints for CRUD operations on notification events
 */

/**
 * Get all events for the current tenant
 *
 * @param page Page number (1-indexed, default: 1)
 * @param limit Items per page (default: 15)
 * @returns List of events for the tenant
 * @throws Error if fetch fails
 */
export async function getEvents(
  page: number = 1,
  limit: number = 15,
  search?: string,
  sort?: string,
  filter?: string[],
): Promise<PaginatedEventResponse> {
  try {
    const qs = new URLSearchParams()
    qs.set('page', String(page))
    qs.set('limit', String(limit))
    if (search) qs.set('search', search)
    if (sort) qs.set('sort', sort)
    if (filter && filter.length > 0) filter.forEach((f) => qs.append('filter', f))
    const params = generateApiParameters(`/api/v1/frontend/events?${qs.toString()}`)
    return await get<PaginatedEventResponse>(params)
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to view events')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to view events')
    }

    throw new Error(
      `Failed to fetch events: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}

/**
 * Get a specific event by ID
 *
 * @param eventId Event ID
 * @returns Event details
 * @throws Error if event not found or fetch fails
 */
export async function getEventById(eventId: string): Promise<EventResponse> {
  try {
    const params = generateApiParameters(`/api/v1/frontend/events/${eventId}`)
    return await get<EventResponse>(params)
  } catch (error) {
    const axiosError = error as AxiosError

    if (axiosError.response?.status === STATUS_CODES.NotFound) {
      throw new Error('Event not found')
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to view this event')
    }

    throw new Error(
      `Failed to fetch event: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

export interface CreateEventData {
  name: string
  description: string
}

/**
 * Create a new event
 *
 * @param data Event creation data
 * @returns Created event, including the id the edit page is keyed on
 * @throws Error if creation fails
 */
export async function createEvent(data: CreateEventData): Promise<EventResponse> {
  try {
    const params = generateApiParameters('/api/v1/frontend/events')
    return await post<EventResponse>({ ...params, data })
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.Conflict) {
      throw Object.assign(new Error('An event with this name already exists'), {
        status: STATUS_CODES.Conflict,
      })
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to create events')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to create events')
    }

    throw new Error(
      `Failed to create event: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}

/**
 * Update an event
 *
 * @param eventId Event ID
 * @param updateData Event update data
 * @returns Updated event details
 * @throws Error if update fails
 */
export async function updateEvent(
  eventId: string,
  updateData: Partial<CreateEventData>,
): Promise<EventResponse> {
  try {
    const params = generateApiParameters(`/api/v1/frontend/events/${eventId}`)
    return await post<EventResponse>({ ...params, data: updateData })
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.NotFound) {
      throw new Error('Event not found')
    }
    if (axiosError.response?.status === STATUS_CODES.Conflict) {
      throw Object.assign(new Error('An event with this name already exists'), {
        status: STATUS_CODES.Conflict,
      })
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to update this event')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to update this event')
    }

    throw new Error(
      `Failed to update event: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}
