import { describe, it, expect } from 'vitest'
import reducer, {
  setPage,
  setLimit,
  setSearch,
  setSort,
  setFilter,
} from './notificationDetail.slice'
import {
  fetchNotificationDetails,
  fetchNotificationRequest,
} from '../thunks/notificationDetail.thunks'

describe('notificationDetail', () => {
  it('clamps pagination and resets it for query changes', () => {
    expect(reducer(undefined, setPage(-1)).page).toBe(1)
    const state = reducer(undefined, setPage(4))
    expect(reducer(state, setLimit(30))).toMatchObject({ page: 1, limit: 30 })
    expect(reducer(state, setSearch('alice'))).toMatchObject({ page: 1, search: 'alice' })
    expect(reducer(state, setSort({ sortBy: 'status', sortOrder: 'desc' }))).toMatchObject({
      page: 1,
      sortBy: 'status',
      sortOrder: 'desc',
    })
    const filtered = reducer(state, setFilter({ field: 'status', values: ['sent'] }))
    expect(filtered).toMatchObject({ page: 1, filters: { status: ['sent'] } })
    expect(reducer(filtered, setFilter({ field: 'status', values: [] })).filters).toEqual({})
  })
  it('stores the matching response and ignores stale deliveries', () => {
    const pending = reducer(undefined, fetchNotificationDetails.pending('latest', 'request'))
    const payload = { data: [], count: 0, page: 2, limit: 15, totalPages: 0 }
    expect(pending).toMatchObject({ isLoading: true, error: null })
    expect(reducer(pending, fetchNotificationDetails.fulfilled(payload, 'old', 'request'))).toEqual(
      pending,
    )
    expect(
      reducer(pending, fetchNotificationDetails.rejected(null, 'old', 'request', 'Old error')),
    ).toEqual(pending)
    expect(
      reducer(pending, fetchNotificationDetails.fulfilled(payload, 'latest', 'request')),
    ).toMatchObject({
      items: [],
      page: 2,
      hasLoaded: true,
      isLoading: false,
      currentRequestId: null,
    })
  })
  it.each([undefined, 'Server unavailable'])('reports rejected deliveries: %s', (error) => {
    const pending = reducer(undefined, fetchNotificationDetails.pending('latest', 'request'))
    expect(
      reducer(pending, fetchNotificationDetails.rejected(null, 'latest', 'request', error)),
    ).toMatchObject({
      isLoading: false,
      error: error ?? 'Failed to load notification details',
      currentRequestId: null,
    })
  })
  it('ignores stale request headers and stores matching headers', () => {
    const pending = reducer(undefined, fetchNotificationRequest.pending('latest', 'request'))
    const payload = { id: 'request' } as Parameters<typeof fetchNotificationRequest.fulfilled>[0]
    expect(reducer(pending, fetchNotificationRequest.fulfilled(payload, 'old', 'request'))).toEqual(
      pending,
    )
    expect(
      reducer(pending, fetchNotificationRequest.fulfilled(payload, 'latest', 'request')),
    ).toMatchObject({ notificationRequest: payload, requestFetchId: null })
  })
})
