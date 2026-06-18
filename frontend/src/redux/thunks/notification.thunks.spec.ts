import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchNotifications } from './notification.thunks'
import { notificationApi } from '@/api'
import { NotificationStatus } from '@/enum/notification-status.enum'

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

  it('reads page, limit, and status from Redux state and returns the full response', async () => {
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
        statusFilter: NotificationStatus.COMPLETED,
        page: 2,
        limit: 10,
      },
    }))

    const result = await fetchNotifications()(dispatch, getState, undefined)

    expect(notificationApi.listNotifications).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      status: NotificationStatus.COMPLETED,
    })
    expect(result.payload).toEqual(response)
  })
})
