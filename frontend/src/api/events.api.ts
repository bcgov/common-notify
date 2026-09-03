import type { AxiosError } from 'axios'
import { get, post, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { PaginatedEventResponse } from '@/interfaces/PaginatedNotificationResponse'

/**
 * ValidationExceptionFilter always sets `message` to the generic 'Validation failed' but
 * includes the real per-field detail in `errors` - prefer that when present.
 */
function extractErrorMessage(responseData: any, fallback: string): string {
  if (Array.isArray(responseData?.errors) && responseData.errors.length > 0) {
    return responseData.errors.join('; ')
  }
  if (Array.isArray(responseData?.message)) {
    return responseData.message.join(', ')
  }
  if (typeof responseData?.message === 'string') {
    return responseData.message
  }
  return fallback
}

export enum EventStatus {
  ACTIVE = 'ACTIVE',
  DRAFT = 'DRAFT',
}

export interface EventEmailSettings {
  active: boolean
  senderEmail: string | null
  templateId: string | null
  to: string[]
  cc: string[]
  bcc: string[]
}

export interface EventSmsSettings {
  active: boolean
  templateId: string | null
  to: string[]
}

export interface EventResponse {
  id: string
  name: string
  description: string
  /** Channels the event notifies on; empty until a notification tab is configured. */
  channelCodes: string[]
  status: EventStatus
  /** Email channel settings, null until the Email Notification tab is first saved. */
  emailSettings: EventEmailSettings | null
  /** SMS channel settings, null until the SMS Notification tab is first saved. */
  smsSettings: EventSmsSettings | null
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

export type EventEmailSettingsUpdate = EventEmailSettings

/**
 * Update an event's email channel settings (Email Notification tab)
 *
 * Replaces the stored settings, so the tab must send every field it owns. Includes `active`:
 * this is the only path that switches the channel on, since activating requires the settings
 * being saved alongside it to be complete. Turning the channel off immediately goes through
 * updateEventEmailActive instead.
 *
 * @param eventId Event ID
 * @param settings Email channel settings
 * @returns Updated event, including the saved email settings
 * @throws Error if update fails
 */
export async function updateEventEmailSettings(
  eventId: string,
  settings: EventEmailSettingsUpdate,
): Promise<EventResponse> {
  try {
    const params = generateApiParameters(`/api/v1/frontend/events/${eventId}/channels/email`)
    return await post<EventResponse>({ ...params, data: settings })
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.NotFound) {
      throw new Error('Event not found')
    }
    // The backend rejects activating a channel that is not fully configured, or an invalid
    // recipient value; either way, its message names the specific problem, so surface it as-is.
    if (axiosError.response?.status === STATUS_CODES.BadRequest) {
      throw new Error(extractErrorMessage(responseData, 'Validation failed'))
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to update this event')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to update this event')
    }

    throw new Error(
      `Failed to update email settings: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}

/**
 * Immediately switch an event's email channel off (the "Channel active" switch on the Email
 * Notification tab turned off), independent of the rest of the tab's settings. Switching it on
 * goes through updateEventEmailSettings, which sends the settings activation depends on, so
 * this takes no payload.
 *
 * @param eventId Event ID
 * @returns Updated event, with the email channel switched off
 * @throws Error if the deactivation fails
 */
export async function deactivateEventEmailChannel(eventId: string): Promise<EventResponse> {
  try {
    const params = generateApiParameters(
      `/api/v1/frontend/events/${eventId}/channels/email/deactivate`,
    )
    return await post<EventResponse>(params)
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.NotFound) {
      throw new Error('Event not found')
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to update this event')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to update this event')
    }

    throw new Error(
      `Failed to deactivate the channel: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}

export type EventSmsSettingsUpdate = EventSmsSettings

/**
 * Update an event's SMS channel settings (SMS Notification tab)
 *
 * Replaces the stored settings, so the tab must send every field it owns. Includes `active`:
 * this is the only path that switches the channel on, since activating requires the settings
 * being saved alongside it to be complete. Turning the channel off immediately goes through
 * updateEventSmsActive instead.
 *
 * @param eventId Event ID
 * @param settings SMS channel settings
 * @returns Updated event, including the saved SMS settings
 * @throws Error if update fails
 */
export async function updateEventSmsSettings(
  eventId: string,
  settings: EventSmsSettingsUpdate,
): Promise<EventResponse> {
  try {
    const params = generateApiParameters(`/api/v1/frontend/events/${eventId}/channels/sms`)
    return await post<EventResponse>({ ...params, data: settings })
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.NotFound) {
      throw new Error('Event not found')
    }
    // The backend rejects activating a channel that is not fully configured, or an invalid
    // recipient value; either way, its message names the specific problem, so surface it as-is.
    if (axiosError.response?.status === STATUS_CODES.BadRequest) {
      throw new Error(extractErrorMessage(responseData, 'Validation failed'))
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to update this event')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to update this event')
    }

    throw new Error(
      `Failed to update SMS settings: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}

/**
 * Immediately switch an event's SMS channel off (the "Channel active" switch on the SMS
 * Notification tab turned off), independent of the rest of the tab's settings. Switching it on
 * goes through updateEventSmsSettings, which sends the settings activation depends on, so this
 * takes no payload.
 *
 * @param eventId Event ID
 * @returns Updated event, with the SMS channel switched off
 * @throws Error if the deactivation fails
 */
export async function deactivateEventSmsChannel(eventId: string): Promise<EventResponse> {
  try {
    const params = generateApiParameters(
      `/api/v1/frontend/events/${eventId}/channels/sms/deactivate`,
    )
    return await post<EventResponse>(params)
  } catch (error) {
    const axiosError = error as AxiosError
    const responseData = (axiosError.response?.data as any) || {}

    if (axiosError.response?.status === STATUS_CODES.NotFound) {
      throw new Error('Event not found')
    }
    if (axiosError.response?.status === STATUS_CODES.Unauthorized) {
      throw new Error('You are not authorized to update this event')
    }
    if (axiosError.response?.status === STATUS_CODES.Forbidden) {
      throw new Error('You do not have permission to update this event')
    }

    throw new Error(
      `Failed to deactivate the channel: ${
        responseData.message || (error instanceof Error ? error.message : 'Unknown error')
      }`,
    )
  }
}
