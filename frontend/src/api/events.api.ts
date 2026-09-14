import type { AxiosError } from 'axios'
import { get, post, generateApiParameters, STATUS_CODES } from '@/common/api'
import type { PaginatedEventResponse } from '@/interfaces/PaginatedNotificationResponse'

/** The error body the backend returns: Nest's own shape, plus ValidationExceptionFilter's. */
interface ApiErrorBody {
  message?: string | string[]
  errors?: string[]
}

/**
 * ValidationExceptionFilter always sets `message` to the generic 'Validation failed' but
 * includes the real per-field detail in `errors` - prefer that when present.
 */
function extractErrorMessage(responseData: ApiErrorBody, fallback: string): string {
  if (Array.isArray(responseData.errors) && responseData.errors.length > 0) {
    return responseData.errors.join('; ')
  }
  if (Array.isArray(responseData.message)) {
    return responseData.message.join(', ')
  }
  if (typeof responseData.message === 'string') {
    return responseData.message
  }
  return fallback
}

/** What to say for each way a call can fail. Only the statuses a call can return need a message. */
type EventApiMessages = {
  /** Prefix for anything unrecognised, e.g. "Failed to fetch events". */
  action: string
  notFound?: string
  conflict?: string
  unauthorized: string
  forbidden: string
}

/**
 * Maps a failed request to the error the pages surface.
 *
 * A 400 always carries the backend's own message rather than a generic one: it names the field
 * or the rule that failed - an unsupported sender domain, a template from another tenant, too
 * many recipients - which is what the user needs to fix.
 */
function toEventApiError(error: unknown, messages: EventApiMessages): Error {
  const axiosError = error as AxiosError
  const responseData = (axiosError.response?.data as ApiErrorBody) ?? {}
  const status = axiosError.response?.status

  if (status === STATUS_CODES.NotFound && messages.notFound) {
    return new Error(messages.notFound)
  }
  if (status === STATUS_CODES.Conflict && messages.conflict) {
    return Object.assign(new Error(messages.conflict), { status: STATUS_CODES.Conflict })
  }
  if (status === STATUS_CODES.BadRequest) {
    return new Error(extractErrorMessage(responseData, 'Validation failed'))
  }
  if (status === STATUS_CODES.Unauthorized) {
    return new Error(messages.unauthorized)
  }
  if (status === STATUS_CODES.Forbidden) {
    return new Error(messages.forbidden)
  }

  return new Error(
    `${messages.action}: ${extractErrorMessage(
      responseData,
      error instanceof Error ? error.message : 'Unknown error',
    )}`,
  )
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
  /** False when the email uses the tenant's default header. */
  useCustomHeader: boolean
  /** Approved logo shown in the custom header; null when there is none. */
  headerLogoId: string | null
  /** Title shown beside the logo in the custom header; null when there is none. */
  headerTitle: string | null
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
    throw toEventApiError(error, {
      action: 'Failed to fetch events',
      unauthorized: 'You are not authorized to view events',
      forbidden: 'You do not have permission to view events',
    })
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
    throw toEventApiError(error, {
      action: 'Failed to fetch event',
      notFound: 'Event not found',
      unauthorized: 'You are not authorized to view this event',
      forbidden: 'You do not have permission to view this event',
    })
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
    throw toEventApiError(error, {
      action: 'Failed to create event',
      conflict: 'An event with this name already exists',
      unauthorized: 'You are not authorized to create events',
      forbidden: 'You do not have permission to create events',
    })
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
    throw toEventApiError(error, {
      action: 'Failed to update event',
      notFound: 'Event not found',
      conflict: 'An event with this name already exists',
      unauthorized: 'You are not authorized to update this event',
      forbidden: 'You do not have permission to update this event',
    })
  }
}

export type EventEmailSettingsUpdate = EventEmailSettings

/**
 * Update an event's email channel settings (Email Notification tab)
 *
 * Replaces the stored settings, so the tab must send every field it owns. Includes `active`:
 * this is the only path that switches the channel on, since activating requires the settings
 * being saved alongside it to be complete. Turning the channel off immediately goes through
 * deactivateEventEmailChannel instead.
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
    throw toEventApiError(error, {
      action: 'Failed to update email settings',
      notFound: 'Event not found',
      unauthorized: 'You are not authorized to update this event',
      forbidden: 'You do not have permission to update this event',
    })
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
    throw toEventApiError(error, {
      action: 'Failed to deactivate the channel',
      notFound: 'Event not found',
      unauthorized: 'You are not authorized to update this event',
      forbidden: 'You do not have permission to update this event',
    })
  }
}

export type EventSmsSettingsUpdate = EventSmsSettings

/**
 * Update an event's SMS channel settings (SMS Notification tab)
 *
 * Replaces the stored settings, so the tab must send every field it owns. Includes `active`:
 * this is the only path that switches the channel on, since activating requires the settings
 * being saved alongside it to be complete. Turning the channel off immediately goes through
 * deactivateEventSmsChannel instead.
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
    throw toEventApiError(error, {
      action: 'Failed to update SMS settings',
      notFound: 'Event not found',
      unauthorized: 'You are not authorized to update this event',
      forbidden: 'You do not have permission to update this event',
    })
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
    throw toEventApiError(error, {
      action: 'Failed to deactivate the channel',
      notFound: 'Event not found',
      unauthorized: 'You are not authorized to update this event',
      forbidden: 'You do not have permission to update this event',
    })
  }
}
