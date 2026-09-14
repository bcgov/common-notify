import { describe, expect, it } from 'vitest'
import reducer, { setFilter, setLimit, setPage, setSearch, setSort } from './events.slice'
import { fetchEvents } from '../thunks/events.thunks'
import { EventStatus } from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'

const event = (id: string): EventResponse =>
  ({ id, name: id, status: EventStatus.DRAFT }) as EventResponse

const page = (items: EventResponse[], overrides: Record<string, unknown> = {}) =>
  fetchEvents.fulfilled(
    { data: items, count: items.length, page: 1, limit: 15, totalPages: 1, ...overrides },
    'req-1',
    undefined,
  )

const initial = reducer(undefined, { type: '@@INIT' })

describe('eventsSlice', () => {
  it('starts empty, unloaded and on the first page', () => {
    expect(initial).toMatchObject({
      items: [],
      page: 1,
      limit: 15,
      count: 0,
      search: '',
      sortBy: null,
      sortOrder: null,
      filters: {},
      isLoading: false,
      hasLoaded: false,
      error: null,
    })
  })

  describe('query reducers', () => {
    it('moves to a page, never below the first', () => {
      expect(reducer(initial, setPage(3)).page).toBe(3)
      expect(reducer(initial, setPage(0)).page).toBe(1)
      expect(reducer(initial, setPage(-2)).page).toBe(1)
    })

    it('returns to the first page whenever the query changes', () => {
      const onPageThree = reducer(initial, setPage(3))

      expect(reducer(onPageThree, setLimit(30))).toMatchObject({ limit: 30, page: 1 })
      expect(reducer(onPageThree, setSearch('permit'))).toMatchObject({
        search: 'permit',
        page: 1,
      })
      expect(reducer(onPageThree, setSort({ sortBy: 'name', sortOrder: 'asc' }))).toMatchObject({
        sortBy: 'name',
        sortOrder: 'asc',
        page: 1,
      })
      expect(
        reducer(onPageThree, setFilter({ field: 'status', values: [EventStatus.ACTIVE] })),
      ).toMatchObject({ filters: { status: [EventStatus.ACTIVE] }, page: 1 })
    })

    it('clears sorting when the column is unsorted', () => {
      const sorted = reducer(initial, setSort({ sortBy: 'name', sortOrder: 'asc' }))

      const cleared = reducer(sorted, setSort({ sortBy: null, sortOrder: null }))

      expect(cleared.sortBy).toBeNull()
      expect(cleared.sortOrder).toBeNull()
    })

    it('drops a filter entirely when its last value is removed', () => {
      const filtered = reducer(
        initial,
        setFilter({ field: 'channelCodes', values: ['EMAIL', 'SMS'] }),
      )
      expect(filtered.filters).toEqual({ channelCodes: ['EMAIL', 'SMS'] })

      const cleared = reducer(filtered, setFilter({ field: 'channelCodes', values: [] }))

      // An empty array would be sent to the API as an empty `in:` clause, so the field goes away.
      expect(cleared.filters).toEqual({})
    })
  })

  describe('fetching', () => {
    it('marks a load in flight and clears a previous error', () => {
      const failed = reducer(initial, fetchEvents.rejected(null, 'req-0', undefined, 'Boom'))

      const loading = reducer(failed, fetchEvents.pending('req-1', undefined))

      expect(loading.isLoading).toBe(true)
      expect(loading.error).toBeNull()
    })

    it('stores the fetched page', () => {
      const loaded = reducer(
        reducer(initial, fetchEvents.pending('req-1', undefined)),
        page([event('event-a'), event('event-b')], {
          count: 20,
          page: 2,
          limit: 15,
          totalPages: 2,
        }),
      )

      expect(loaded.items.map((row) => row.id)).toEqual(['event-a', 'event-b'])
      expect(loaded).toMatchObject({
        count: 20,
        page: 2,
        limit: 15,
        totalPages: 2,
        isLoading: false,
        hasLoaded: true,
      })
    })

    it('records an empty result as loaded, so the table shows its empty message', () => {
      const loaded = reducer(reducer(initial, fetchEvents.pending('req-1', undefined)), page([]))

      expect(loaded.items).toEqual([])
      expect(loaded.count).toBe(0)
      expect(loaded.hasLoaded).toBe(true)
      expect(loaded.isLoading).toBe(false)
    })

    it('keeps the rejection message for the page to surface', () => {
      const failed = reducer(
        reducer(initial, fetchEvents.pending('req-1', undefined)),
        fetchEvents.rejected(null, 'req-1', undefined, 'You are not authorized to view events'),
      )

      expect(failed.error).toBe('You are not authorized to view events')
      expect(failed.isLoading).toBe(false)
    })

    it('falls back to a generic message when the rejection carries none', () => {
      const failed = reducer(
        initial,
        fetchEvents.rejected(new Error('network'), 'req-1', undefined),
      )

      expect(failed.error).toBe('Failed to load events')
    })
  })
})
