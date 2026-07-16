import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchNotifications } from './notification.thunks'
import { notificationApi } from '@/api'

vi.mock('@/api', () => ({
  notificationApi: {
    listNotifications: vi.fn(),
    connectNotificationStream: vi.fn(),
  },
}))

describe('fetchNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads page, limit, sort, and filters from Redux state and returns the full response', async () => {
    const response = {
      data: [],
      count: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
    }
    vi.mocked(notificationApi.listNotifications).mockResolvedValue(response)

    const dispatch = vi.fn()
    const getState = vi.fn(() => ({
      notification: {
        page: 2,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        filters: { status: ['SENT', 'FAILED'] },
      },
    }))

    const result = await fetchNotifications()(dispatch, getState, undefined)

    expect(notificationApi.listNotifications).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      sort: '-createdAt',
      filter: ['status:in:SENT|FAILED'],
    })
    expect(result.payload).toEqual(response)
  })
})
