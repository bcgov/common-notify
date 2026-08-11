import { describe, expect, it } from 'vitest'
import reducer, { setPage, setFilter } from './notification.slice'
import { fetchNotifications } from '../thunks/notification.thunks'
import { NotificationStatus } from '@/enum/notification-status.enum'

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
      },
      setFilter({ field: 'status', values: [NotificationStatus.COMPLETED] }),
    )

    expect(state.filters.status).toEqual([NotificationStatus.COMPLETED])
    expect(state.page).toBe(1)
  })

  it('stores pagination metadata from fulfilled fetches', () => {
    const state = reducer(
      undefined,
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
        '',
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
})
