import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationApi } from './notification.api'
import { NotificationStatus } from '@/enum/notification-status.enum'
import { get, STATUS_CODES } from '@/common/api'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  generateApiParameters: vi.fn((url: string) => ({ url, requiresAuthentication: true })),
  STATUS_CODES: {
    NotFound: 404,
  },
}))

describe('notificationApi.listNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends page and limit with status when status is filtered', async () => {
    vi.mocked(get).mockResolvedValue({
      data: [],
      count: 0,
      page: 2,
      limit: 25,
      totalPages: 0,
    })

    await notificationApi.listNotifications({
      page: 2,
      limit: 25,
      status: NotificationStatus.COMPLETED,
    })

    expect(get).toHaveBeenCalledWith({
      url: '/api/v1/frontend/notification_request',
      requiresAuthentication: true,
      params: {
        page: 2,
        limit: 25,
        status: NotificationStatus.COMPLETED,
      },
    })
  })

  it('omits status when status is all', async () => {
    vi.mocked(get).mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    })

    await notificationApi.listNotifications({ page: 1, limit: 10, status: 'all' })

    expect(get).toHaveBeenCalledWith({
      url: '/api/v1/frontend/notification_request',
      requiresAuthentication: true,
      params: {
        page: 1,
        limit: 10,
      },
    })
  })

  it('returns an empty paginated response on 404', async () => {
    vi.mocked(get).mockRejectedValue({
      response: {
        status: STATUS_CODES.NotFound,
      },
    })

    await expect(
      notificationApi.listNotifications({ page: 3, limit: 15, status: NotificationStatus.QUEUED }),
    ).resolves.toEqual({
      data: [],
      count: 0,
      page: 3,
      limit: 15,
      totalPages: 0,
    })
  })
})
