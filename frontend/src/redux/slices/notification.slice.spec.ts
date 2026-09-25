import { describe, expect, it } from 'vitest'
import reducer, { setPage, setFilter } from './notification.slice'
import { fetchNotifications } from '../thunks/notification.thunks'
import { NotificationStatus } from '@/enum/notification-status.enum'
import { selectTenant } from './tenant.slice'
import type { Tenant } from '@/interfaces/CstarTenant'

describe('notificationSlice', () => {
  it('resets page to 1 and stores values when a column filter changes', () => {
    const state = reducer(
      {
        items: [],
        sortBy: null,
        sortOrder: null,
        filters: {},
        page: 4,
        limit: 10,
        count: 0,
        totalPages: 0,
        isLoading: false,
        error: null,
        hasLoaded: false,
        currentRequestId: null,
      },
      setFilter({ field: 'status', values: [NotificationStatus.COMPLETED] }),
    )

    expect(state.filters.status).toEqual([NotificationStatus.COMPLETED])
    expect(state.page).toBe(1)
  })

  it('stores pagination metadata from fulfilled fetches', () => {
    // Dispatch the pending first: fulfilled is only applied for the request the slice
    // is currently awaiting, so a fabricated response with no pending is discarded.
    const pending = reducer(undefined, fetchNotifications.pending('req-1', undefined))
    const state = reducer(
      pending,
      fetchNotifications.fulfilled(
        {
          data: [
            {
              id: 'notif-1',
              tenantId: 'tenant-1',
              status: { code: NotificationStatus.QUEUED, displayName: 'Queued' },
              createdAt: '2026-05-12T00:00:00.000Z',
              updatedAt: '2026-05-12T00:00:00.000Z',
            },
          ],
          count: 23,
          page: 2,
          limit: 10,
          totalPages: 3,
        },
        'req-1',
        undefined,
      ),
    )

    expect(state.items).toHaveLength(1)
    expect(state.count).toBe(23)
    expect(state.page).toBe(2)
    expect(state.limit).toBe(10)
    expect(state.totalPages).toBe(3)
  })

  it('updates page with setPage', () => {
    const state = reducer(undefined, setPage(3))
    expect(state.page).toBe(3)
  })

  it("drops the previous tenant's rows when the tenant changes", () => {
    const pending = reducer(undefined, fetchNotifications.pending('req-1', undefined))
    const loaded = reducer(
      pending,
      fetchNotifications.fulfilled(
        {
          data: [
            {
              id: 'tenant-a-notif',
              tenantId: 'tenant-a',
              status: { code: NotificationStatus.COMPLETED, displayName: 'Completed' },
              createdAt: '2026-05-12T00:00:00.000Z',
              updatedAt: '2026-05-12T00:00:00.000Z',
            },
          ],
          count: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        'req-1',
        undefined,
      ),
    )
    expect(loaded.items).toHaveLength(1)
    expect(loaded.hasLoaded).toBe(true)

    const switched = reducer(loaded, selectTenant({ id: 'tenant-b' } as Tenant))

    // Nothing from tenant A may stay on screen, and hasLoaded must fall back so the
    // table renders its loading state rather than the previous tenant's rows.
    expect(switched.items).toEqual([])
    expect(switched.count).toBe(0)
    expect(switched.hasLoaded).toBe(false)
    expect(switched.isLoading).toBe(true)
  })

  it('ignores a response from a request the tenant switch superseded', () => {
    const switched = reducer(undefined, selectTenant({ id: 'tenant-b' } as Tenant))

    const stale = reducer(
      switched,
      fetchNotifications.fulfilled(
        {
          data: [
            {
              id: 'tenant-a-notif',
              tenantId: 'tenant-a',
              status: { code: NotificationStatus.COMPLETED, displayName: 'Completed' },
              createdAt: '2026-05-12T00:00:00.000Z',
              updatedAt: '2026-05-12T00:00:00.000Z',
            },
          ],
          count: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        'in-flight-for-tenant-a',
        undefined,
      ),
    )

    expect(stale.items).toEqual([])
  })

  it('ignores a slow response once a newer request is in flight', () => {
    const firstPending = reducer(undefined, fetchNotifications.pending('req-1', undefined))
    const secondPending = reducer(firstPending, fetchNotifications.pending('req-2', undefined))

    const page = (id: string, count: number) =>
      fetchNotifications.fulfilled(
        { data: [], count, page: 1, limit: 10, totalPages: 1 },
        id,
        undefined,
      )

    // req-2 wins the race, then the superseded req-1 finally lands.
    const newest = reducer(secondPending, page('req-2', 2))
    const afterStale = reducer(newest, page('req-1', 99))

    expect(afterStale.count).toBe(2)
    expect(afterStale.isLoading).toBe(false)
  })

  it('keeps loading when a superseded request fails', () => {
    const firstPending = reducer(undefined, fetchNotifications.pending('req-1', undefined))
    const secondPending = reducer(firstPending, fetchNotifications.pending('req-2', undefined))

    const state = reducer(
      secondPending,
      fetchNotifications.rejected(new Error('boom'), 'req-1', undefined, 'Failed'),
    )

    expect(state.isLoading).toBe(true)
    expect(state.error).toBeNull()
  })
})
