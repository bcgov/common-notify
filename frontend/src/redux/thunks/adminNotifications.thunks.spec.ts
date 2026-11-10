import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import reducer, {
  setDateRange,
  setFilter,
  setSearch,
} from '@/redux/slices/adminNotifications.slice'
import { fetchAdminNotifications } from './adminNotifications.thunks'
import { localDay } from '@/utils/dates'
import { listAdminNotifications } from '@/api/adminNotifications.api'

vi.mock('@/api/adminNotifications.api', () => ({ listAdminNotifications: vi.fn() }))

const row = {
  id: 'req-1',
  tenantId: 't-1',
  tenantName: 'Parks',
  status: { code: 'failed', displayName: 'Failed' },
  channels: ['EMAIL'],
  requestRoute: 'notifysimple',
  createdAt: '2026-11-10T10:00:00.000Z',
  scheduledFor: null,
  recipientCount: 3,
  failedCount: 1,
}

function makeStore() {
  return configureStore({ reducer: { adminNotifications: reducer } })
}

describe('fetchAdminNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminNotifications).mockResolvedValue({
      data: [row],
      count: 1,
      page: 1,
      limit: 15,
      totalPages: 1,
    })
  })

  it('defaults to the last week, today included', () => {
    const state = reducer(undefined, { type: 'init' })
    expect(state.from).toBe(localDay(6))
    expect(state.to).toBe(localDay())
  })

  it('sends the tenant search, column filters and the whole of each day in the range', async () => {
    const store = makeStore()
    store.dispatch(setSearch('Parks'))
    store.dispatch(setFilter({ field: 'status', values: ['failed', 'queued'] }))
    store.dispatch(setFilter({ field: 'channel', values: [] }))
    store.dispatch(setDateRange({ from: '2026-11-01', to: '2026-11-03' }))

    await store.dispatch(fetchAdminNotifications())

    expect(listAdminNotifications).toHaveBeenCalledWith({
      page: 1,
      limit: 15,
      search: 'Parks',
      filter: [
        'status:in:failed|queued',
        `createdAt:gte:${new Date('2026-11-01T00:00:00').toISOString()}`,
        `createdAt:lte:${new Date('2026-11-03T23:59:59.999').toISOString()}`,
      ],
    })
    expect(store.getState().adminNotifications).toMatchObject({
      items: [row],
      count: 1,
      hasLoaded: true,
      isLoading: false,
    })
  })

  it('leaves an open end of the range unfiltered', async () => {
    const store = makeStore()
    store.dispatch(setDateRange({ from: null, to: null }))

    await store.dispatch(fetchAdminNotifications())

    expect(listAdminNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined, filter: [] }),
    )
  })

  it('keeps the error for the page to report', async () => {
    vi.mocked(listAdminNotifications).mockRejectedValue(
      new Error('Failed to load notifications: down'),
    )
    const store = makeStore()

    await store.dispatch(fetchAdminNotifications())

    expect(store.getState().adminNotifications.error).toBe('Failed to load notifications: down')
    expect(store.getState().adminNotifications.isLoading).toBe(false)
  })

  it('goes back to the first page when the query changes', () => {
    let state = reducer(undefined, { type: 'init' })
    state = { ...state, page: 4 }
    expect(reducer(state, setDateRange({ from: null, to: null })).page).toBe(1)
    expect(reducer(state, setFilter({ field: 'status', values: ['failed'] })).page).toBe(1)
  })
})
