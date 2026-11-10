import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationApi } from './notification.api'
import { get, STATUS_CODES } from '@/common/api'
import { fetchEventSource } from '@microsoft/fetch-event-source'

vi.mock('@microsoft/fetch-event-source', () => ({ fetchEventSource: vi.fn() }))
vi.mock('@/service/user-service', () => ({
  default: { getToken: vi.fn().mockResolvedValue('token') },
}))

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

describe('delivery details and notification streams', () => {
  beforeEach(() => vi.clearAllMocks())
  it('serializes delivery searches, filters and sorting', async () => {
    vi.mocked(get).mockResolvedValue({ data: [] })
    await notificationApi.listRequestDetails('request', {
      page: 2,
      limit: 30,
      search: 'alice@example.com',
      sort: '-status',
      filter: ['channel:in:EMAIL', 'status:in:failed'],
    })
    const query = calledQuery()
    expect(query.get('search')).toBe('alice@example.com')
    expect(query.get('page')).toBe('2')
    expect(query.get('limit')).toBe('30')
    expect(query.get('sort')).toBe('-status')
    expect(query.getAll('filter')).toEqual(['channel:in:EMAIL', 'status:in:failed'])
    await notificationApi.getNotification('request')
    expect(get).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: '/api/v1/frontend/notification_request/request' }),
    )
  })
  it('omits inactive query parameters', async () => {
    vi.mocked(get).mockResolvedValue({ data: [] })
    await notificationApi.listRequestDetails('request')
    expect(calledQuery().size).toBe(0)
    vi.mocked(get).mockClear()
    await notificationApi.listNotifications()
    expect(calledQuery().size).toBe(0)
  })
  it('returns default and explicit pagination on missing requests', async () => {
    vi.mocked(get).mockRejectedValue({ response: { status: 404 } })
    await expect(notificationApi.listRequestDetails('request')).resolves.toEqual({
      data: [],
      count: 0,
      page: 1,
      limit: 15,
      totalPages: 0,
    })
    await expect(
      notificationApi.listRequestDetails('request', { page: 3, limit: 30 }),
    ).resolves.toEqual({ data: [], count: 0, page: 3, limit: 30, totalPages: 0 })
    await expect(notificationApi.listNotifications()).resolves.toEqual({
      data: [],
      count: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    })
  })
  it.each([new Error('Offline'), {}])('reports errors from both lists: %s', async (error) => {
    vi.mocked(get).mockRejectedValue(error)
    await expect(notificationApi.listRequestDetails('request')).rejects.toThrow(
      error instanceof Error ? /Offline/ : /Unknown error/,
    )
    await expect(notificationApi.listNotifications()).rejects.toThrow(
      error instanceof Error ? /Offline/ : /Unknown error/,
    )
  })
  it.each(['tenant', undefined])(
    'authenticates streams and forwards changes with tenant %s',
    async (tenantId) => {
      const onMessage = vi.fn(),
        onError = vi.fn()
      const controller = notificationApi.connectNotificationStream(onMessage, onError, tenantId)
      const options = vi.mocked(fetchEventSource).mock.calls[0][1]
      options.onmessage!({ event: 'keepalive', data: '', id: '' })
      expect(onMessage).not.toHaveBeenCalled()
      options.onmessage!({ event: 'changed', data: '', id: '' })
      expect(onMessage).toHaveBeenCalledTimes(1)
      const error = new Error('Disconnected')
      options.onerror!(error)
      expect(onError).toHaveBeenCalledWith(error)
      const fetchMock = vi.fn().mockResolvedValue(new Response())
      vi.stubGlobal('fetch', fetchMock)
      try {
        await options.fetch!('/stream', { headers: { Custom: 'value' } })
        expect(fetchMock).toHaveBeenCalledWith(
          '/stream',
          expect.objectContaining({
            headers: {
              Custom: 'value',
              Authorization: 'Bearer token',
              ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
            },
          }),
        )
      } finally {
        vi.unstubAllGlobals()
      }
      controller.abort()
      expect(options.signal?.aborted).toBe(true)
      notificationApi.connectNotificationStream(onMessage)
      expect(() => vi.mocked(fetchEventSource).mock.calls[1][1].onerror!(error)).not.toThrow()
    },
  )
})
