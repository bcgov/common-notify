import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEvent,
  deactivateEventEmailChannel,
  deactivateEventSmsChannel,
  getEventById,
  getEvents,
  updateEvent,
  updateEventEmailSettings,
  updateEventSmsSettings,
} from './events.api'
import { generateApiParameters, get, post } from '@/common/api'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  generateApiParameters: vi.fn((url: string, params?: unknown) => ({
    url,
    params,
    requiresAuthentication: true,
  })),
  STATUS_CODES: {
    BadRequest: 400,
    Unauthorized: 401,
    Forbidden: 403,
    NotFound: 404,
    Conflict: 409,
  },
}))

const BASE_URL = '/api/v1/frontend/events'

const httpError = (status: number, data?: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  })

describe('events.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getEvents', () => {
    it('defaults to the first page of fifteen', async () => {
      vi.mocked(get).mockResolvedValue({ items: [], total: 0 })

      await getEvents()

      expect(get).toHaveBeenCalledWith(
        expect.objectContaining({ url: `${BASE_URL}?page=1&limit=15` }),
      )
    })

    it('passes paging, search, sort and each filter through', async () => {
      vi.mocked(get).mockResolvedValue({ items: [], total: 0 })

      await getEvents(2, 50, 'permit', '-updatedAt', ['status:in:ACTIVE', 'channelCodes:in:SMS'])

      const { url } = vi.mocked(get).mock.calls[0][0] as { url: string }
      expect(url).toContain('page=2')
      expect(url).toContain('limit=50')
      expect(url).toContain('search=permit')
      expect(url).toContain('sort=-updatedAt')
      expect(url).toContain('filter=status%3Ain%3AACTIVE')
      expect(url).toContain('filter=channelCodes%3Ain%3ASMS')
    })

    it.each([
      [401, 'You are not authorized to view events'],
      [403, 'You do not have permission to view events'],
    ])('explains a %i', async (status, message) => {
      vi.mocked(get).mockRejectedValue(httpError(status))

      await expect(getEvents()).rejects.toThrow(message)
    })
  })

  describe('error mapping', () => {
    it('prefers the per-field errors a validation failure carries', async () => {
      vi.mocked(get).mockRejectedValue(
        httpError(400, {
          message: 'Validation failed',
          errors: ['name should not be empty', 'templateId must be a UUID'],
        }),
      )

      await expect(getEvents()).rejects.toThrow(
        'name should not be empty; templateId must be a UUID',
      )
    })

    it('joins an array message when there are no per-field errors', async () => {
      vi.mocked(get).mockRejectedValue(httpError(400, { message: ['bad sender', 'bad template'] }))

      await expect(getEvents()).rejects.toThrow('bad sender, bad template')
    })

    it('uses a single string message as-is', async () => {
      vi.mocked(get).mockRejectedValue(httpError(400, { message: 'sender domain not allowed' }))

      await expect(getEvents()).rejects.toThrow('sender domain not allowed')
    })

    it('falls back to a generic message when a 400 carries no detail', async () => {
      vi.mocked(get).mockRejectedValue(httpError(400, {}))

      await expect(getEvents()).rejects.toThrow('Validation failed')
    })

    it('prefixes an unrecognised status with what was being attempted', async () => {
      vi.mocked(get).mockRejectedValue(httpError(500, { message: 'upstream exploded' }))

      await expect(getEvents()).rejects.toThrow('Failed to fetch events: upstream exploded')
    })

    it('handles a failure with no response at all', async () => {
      vi.mocked(get).mockRejectedValue(new Error('Network Error'))

      await expect(getEvents()).rejects.toThrow('Failed to fetch events: Network Error')
    })
  })

  describe('getEventById', () => {
    it('reads one event by id', async () => {
      vi.mocked(get).mockResolvedValue({ id: 'e1' })

      await expect(getEventById('e1')).resolves.toEqual({ id: 'e1' })
      expect(get).toHaveBeenCalledWith(expect.objectContaining({ url: `${BASE_URL}/e1` }))
    })

    it('explains a 404', async () => {
      vi.mocked(get).mockRejectedValue(httpError(404))

      await expect(getEventById('e1')).rejects.toThrow('Event not found')
    })
  })

  describe('createEvent', () => {
    const data = { name: 'Permit renewal' } as Parameters<typeof createEvent>[0]

    it('posts the new event', async () => {
      vi.mocked(post).mockResolvedValue({ id: 'e1' })

      await createEvent(data)

      expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: BASE_URL, data }))
    })

    it('marks a duplicate name with its status', async () => {
      vi.mocked(post).mockRejectedValue(httpError(409))

      await expect(createEvent(data)).rejects.toMatchObject({
        message: 'An event with this name already exists',
        status: 409,
      })
    })

    it('explains a 403', async () => {
      vi.mocked(post).mockRejectedValue(httpError(403))

      await expect(createEvent(data)).rejects.toThrow('You do not have permission to create events')
    })
  })

  describe('updateEvent', () => {
    it('posts the changed fields', async () => {
      vi.mocked(post).mockResolvedValue({ id: 'e1' })

      await updateEvent('e1', { name: 'Renamed' })

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ url: `${BASE_URL}/e1`, data: { name: 'Renamed' } }),
      )
    })

    it('explains a 404', async () => {
      vi.mocked(post).mockRejectedValue(httpError(404))

      await expect(updateEvent('e1', {})).rejects.toThrow('Event not found')
    })
  })

  describe('channel settings', () => {
    beforeEach(() => {
      vi.mocked(post).mockResolvedValue({ id: 'e1' })
    })

    it('updates email settings on the email channel route', async () => {
      await updateEventEmailSettings('e1', { enabled: true } as Parameters<
        typeof updateEventEmailSettings
      >[1])

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `${BASE_URL}/e1/channels/email`,
          data: { enabled: true },
        }),
      )
    })

    it('deactivates the email channel with no payload', async () => {
      await deactivateEventEmailChannel('e1')

      const call = vi.mocked(post).mock.calls[0][0] as Record<string, unknown>
      expect(call.url).toBe(`${BASE_URL}/e1/channels/email/deactivate`)
      expect(call.data).toBeUndefined()
    })

    it('updates SMS settings on the sms channel route', async () => {
      await updateEventSmsSettings('e1', { enabled: true } as Parameters<
        typeof updateEventSmsSettings
      >[1])

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ url: `${BASE_URL}/e1/channels/sms`, data: { enabled: true } }),
      )
    })

    it('deactivates the SMS channel with no payload', async () => {
      await deactivateEventSmsChannel('e1')

      const call = vi.mocked(post).mock.calls[0][0] as Record<string, unknown>
      expect(call.url).toBe(`${BASE_URL}/e1/channels/sms/deactivate`)
      expect(call.data).toBeUndefined()
    })

    it('explains a channel failure in terms of the channel, not the event', async () => {
      vi.mocked(post).mockRejectedValue(httpError(500, {}))

      await expect(deactivateEventSmsChannel('e1')).rejects.toThrow(
        /Failed to deactivate the channel/,
      )
    })
  })

  it('routes every call through generateApiParameters', () => {
    expect(vi.mocked(generateApiParameters)).toBeDefined()
  })
})
