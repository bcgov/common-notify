import { beforeEach, describe, it, expect, vi } from 'vitest'
import { notificationApi } from '@/api'
import { fetchNotificationDetails, fetchNotificationRequest } from './notificationDetail.thunks'
import type { RootState } from '../store'
import reducer from '../slices/notificationDetail.slice'
vi.mock('@/api', () => ({
  notificationApi: { getNotification: vi.fn(), listRequestDetails: vi.fn() },
}))
const dispatch = vi.fn()
const state = { notificationDetail: reducer(undefined, { type: 'init' }) } as RootState
describe('notification detail thunks', () => {
  beforeEach(() => vi.clearAllMocks())
  it.each(['asc', 'desc', null] as const)(
    'serializes sort order %s, search and nonempty filters',
    async (sortOrder) => {
      vi.mocked(notificationApi.listRequestDetails).mockResolvedValue({
        data: [],
        count: 0,
        page: 2,
        limit: 30,
        totalPages: 0,
      })
      const getState = () => ({
        ...state,
        notificationDetail: {
          ...state.notificationDetail,
          page: 2,
          limit: 30,
          search: 'alice',
          sortBy: 'status',
          sortOrder,
          filters: { channel: ['EMAIL', 'SMS'], status: [] },
        },
      })
      const result = await fetchNotificationDetails('request')(dispatch, getState, undefined)
      expect(result.meta.requestStatus).toBe('fulfilled')
      expect(notificationApi.listRequestDetails).toHaveBeenCalledWith('request', {
        page: 2,
        limit: 30,
        search: 'alice',
        sort: sortOrder === 'asc' ? 'status' : sortOrder === 'desc' ? '-status' : undefined,
        filter: ['channel:in:EMAIL|SMS'],
      })
    },
  )
  it('omits inactive search, sort and filters', async () => {
    await fetchNotificationDetails('request')(dispatch, () => state, undefined)
    expect(notificationApi.listRequestDetails).toHaveBeenCalledWith('request', {
      page: 1,
      limit: 15,
      search: undefined,
      sort: undefined,
      filter: undefined,
    })
  })
  it('fetches the parent request', async () => {
    vi.mocked(notificationApi.getNotification).mockResolvedValue({ id: 'request' } as Awaited<
      ReturnType<typeof notificationApi.getNotification>
    >)
    expect(
      (await fetchNotificationRequest('request')(dispatch, () => state, undefined)).payload,
    ).toEqual({ id: 'request' })
  })
  it.each([new Error('Offline'), {}])(
    'returns readable failures for both requests: %s',
    async (error) => {
      vi.mocked(notificationApi.getNotification).mockRejectedValue(error)
      vi.mocked(notificationApi.listRequestDetails).mockRejectedValue(error)
      const request = await fetchNotificationRequest('request')(dispatch, () => state, undefined)
      const details = await fetchNotificationDetails('request')(dispatch, () => state, undefined)
      expect(request.meta.requestStatus).toBe('rejected')
      expect(request.payload).toBe(
        error instanceof Error ? 'Offline' : 'Failed to load notification request',
      )
      expect(details.payload).toBe(
        error instanceof Error ? 'Offline' : 'Failed to load notification details',
      )
    },
  )
})
