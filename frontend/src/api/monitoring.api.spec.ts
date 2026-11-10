import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { get } from '@/common/api'
import { connectQueueMonitoringStream, getQueueMonitoring } from './monitoring.api'
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/common/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get: vi.fn(),
}))
vi.mock('@/service/user-service', () => ({
  default: { getToken: vi.fn().mockResolvedValue('fresh-token') },
}))

describe('monitoring API', () => {
  beforeEach(() => vi.clearAllMocks())
  it('loads queue snapshots', async () => {
    vi.mocked(get).mockResolvedValue({ status: 'healthy' })
    await expect(getQueueMonitoring()).resolves.toEqual({ status: 'healthy' })
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/frontend/admin/monitoring/queues' }),
    )
  })
  it.each([401, 403, 500])('translates HTTP failures: %s', async (status) => {
    vi.mocked(get).mockRejectedValue({ response: { status, data: { message: 'Offline' } } })
    await expect(getQueueMonitoring()).rejects.toThrow(status === 500 ? /Offline/ : /permission/)
  })
  it.each([new Error('Network error'), {}])(
    'handles errors without HTTP responses: %s',
    async (error) => {
      vi.mocked(get).mockRejectedValue(error)
      await expect(getQueueMonitoring()).rejects.toThrow(
        error instanceof Error ? /Network error/ : /Unknown error/,
      )
    },
  )
  it('opens a stream, ignores keepalives and refreshes authentication on reconnect', async () => {
    const handlers = { onOpen: vi.fn(), onChange: vi.fn(), onError: vi.fn() }
    const controller = connectQueueMonitoringStream(handlers)
    const options = vi.mocked(fetchEventSource).mock.calls[0][1]
    await options.onopen!(new Response('', { status: 200 }))
    expect(handlers.onOpen).toHaveBeenCalled()
    options.onmessage!({ event: 'ping', data: '', id: '' })
    expect(handlers.onChange).not.toHaveBeenCalled()
    options.onmessage!({ event: 'changed', data: '', id: '' })
    expect(handlers.onChange).toHaveBeenCalledTimes(1)
    const fetchMock = vi.fn().mockResolvedValue(new Response())
    vi.stubGlobal('fetch', fetchMock)
    try {
      await options.fetch!('/stream', { headers: { Custom: 'value' } })
      expect(fetchMock).toHaveBeenCalledWith(
        '/stream',
        expect.objectContaining({
          headers: { Custom: 'value', Authorization: 'Bearer fresh-token' },
        }),
      )
    } finally {
      vi.unstubAllGlobals()
    }
    controller.abort()
    expect(options.signal?.aborted).toBe(true)
  })
  it.each([401, 403, 500])(
    'stops retries on refused streams but retries transient failures: %s',
    async (status) => {
      const handlers = { onOpen: vi.fn(), onChange: vi.fn(), onError: vi.fn() }
      connectQueueMonitoringStream(handlers)
      const options = vi.mocked(fetchEventSource).mock.calls[0][1]
      let failure: unknown
      try {
        await options.onopen!(new Response('', { status }))
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(Error)
      if (status === 500) expect(() => options.onerror!(failure)).not.toThrow()
      else expect(() => options.onerror!(failure)).toThrow()
      expect(handlers.onError).toHaveBeenCalledWith(status !== 500)
    },
  )
})
