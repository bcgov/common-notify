import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationApi } from './notification.api'
import { get, STATUS_CODES } from '@/common/api'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  generateApiParameters: vi.fn((url: string) => ({ url, requiresAuthentication: true })),
  STATUS_CODES: {
    NotFound: 404,
  },
}))

/** Extract the query params from the URL the `get` mock was called with. */
function calledQuery() {
  const call = vi.mocked(get).mock.calls[0][0] as { url: string }
  return new URLSearchParams(call.url.split('?')[1] ?? '')
}

describe('notificationApi.listNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends page, limit, sort, and filter as query params', async () => {
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
      sort: '-createdAt',
      filter: ['status:in:SENT|FAILED', 'channelCodes:in:EMAIL'],
    })

    const qs = calledQuery()
    expect(qs.get('page')).toBe('2')
    expect(qs.get('limit')).toBe('25')
    expect(qs.get('sort')).toBe('-createdAt')
    expect(qs.getAll('filter')).toEqual(['status:in:SENT|FAILED', 'channelCodes:in:EMAIL'])
  })

  it('omits sort and filter when not provided', async () => {
    vi.mocked(get).mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    })

    await notificationApi.listNotifications({ page: 1, limit: 10 })

    const qs = calledQuery()
    expect(qs.get('page')).toBe('1')
    expect(qs.get('limit')).toBe('10')
    expect(qs.has('sort')).toBe(false)
    expect(qs.has('filter')).toBe(false)
  })

  it('returns an empty paginated response on 404', async () => {
    vi.mocked(get).mockRejectedValue({
      response: {
        status: STATUS_CODES.NotFound,
      },
    })

    await expect(notificationApi.listNotifications({ page: 3, limit: 15 })).resolves.toEqual({
      data: [],
      count: 0,
      page: 3,
      limit: 15,
      totalPages: 0,
    })
  })
})
