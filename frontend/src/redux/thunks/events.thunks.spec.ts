import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchEvents } from './events.thunks'
import { getEvents } from '@/api/events.api'
import type { RootState } from '../store'

vi.mock('@/api/events.api', () => ({
  getEvents: vi.fn(),
}))

const emptyPage = { data: [], count: 0, page: 1, limit: 15, totalPages: 0 }

type EventsQuery = {
  page?: number
  limit?: number
  search?: string
  sortBy?: string | null
  sortOrder?: 'asc' | 'desc' | null
  filters?: Record<string, string[]>
}

function stateWith(events: EventsQuery = {}, tenantId: string | null = 'tenant-1') {
  return () =>
    ({
      tenant: { selectedTenant: tenantId ? { id: tenantId } : null },
      events: {
        page: 1,
        limit: 15,
        search: '',
        sortBy: null,
        sortOrder: null,
        filters: {},
        ...events,
      },
    }) as unknown as RootState
}

async function run(getState: () => RootState) {
  return fetchEvents()(vi.fn(), getState, undefined)
}

describe('fetchEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getEvents).mockResolvedValue(emptyPage)
  })

  it('does not call the API until a tenant is selected', async () => {
    const result = await run(stateWith({}, null))

    expect(getEvents).not.toHaveBeenCalled()
    // An empty page rather than a rejection, so the table waits rather than showing an error.
    expect(result.payload).toEqual(emptyPage)
  })

  it('sends the current page and limit, omitting an empty search, sort and filters', async () => {
    await run(stateWith({ page: 2, limit: 30 }))

    expect(getEvents).toHaveBeenCalledWith(2, 30, undefined, undefined, undefined)
  })

  it('sends the search term when there is one', async () => {
    await run(stateWith({ search: 'permit' }))

    expect(getEvents).toHaveBeenCalledWith(1, 15, 'permit', undefined, undefined)
  })

  it('sends an ascending sort as the bare field', async () => {
    await run(stateWith({ sortBy: 'name', sortOrder: 'asc' }))

    expect(getEvents).toHaveBeenCalledWith(1, 15, undefined, 'name', undefined)
  })

  it('prefixes a descending sort with a minus', async () => {
    await run(stateWith({ sortBy: 'updatedAt', sortOrder: 'desc' }))

    expect(getEvents).toHaveBeenCalledWith(1, 15, undefined, '-updatedAt', undefined)
  })

  it('ignores a sort column with no direction', async () => {
    await run(stateWith({ sortBy: 'name', sortOrder: null }))

    expect(getEvents).toHaveBeenCalledWith(1, 15, undefined, undefined, undefined)
  })

  it('builds one in: clause per filtered field and drops empty ones', async () => {
    await run(
      stateWith({
        filters: { status: ['ACTIVE', 'DRAFT'], channelCodes: ['EMAIL'], description: [] },
      }),
    )

    expect(getEvents).toHaveBeenCalledWith(1, 15, undefined, undefined, [
      'status:in:ACTIVE|DRAFT',
      'channelCodes:in:EMAIL',
    ])
  })

  it('returns the API response as the fulfilled payload', async () => {
    const response = { data: [], count: 3, page: 1, limit: 15, totalPages: 1 }
    vi.mocked(getEvents).mockResolvedValue(response)

    const result = await run(stateWith())

    expect(result.payload).toEqual(response)
  })

  it('rejects with the API error message so the page can toast it', async () => {
    vi.mocked(getEvents).mockRejectedValue(new Error('You do not have permission to view events'))

    const result = await run(stateWith())

    expect(result.type).toBe('events/fetchAll/rejected')
    expect(result.payload).toBe('You do not have permission to view events')
  })

  it('rejects with a generic message when the failure is not an Error', async () => {
    vi.mocked(getEvents).mockRejectedValue('kaboom')

    const result = await run(stateWith())

    expect(result.payload).toBe('Failed to load events')
  })
})
