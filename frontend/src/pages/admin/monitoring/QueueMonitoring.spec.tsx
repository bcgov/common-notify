import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QueueMonitoring, { BACKSTOP_INTERVAL_MS, FALLBACK_INTERVAL_MS } from './QueueMonitoring'
import type { MonitoringTab } from './QueueMonitoring'
import { connectQueueMonitoringStream, getQueueMonitoring } from '@/api/monitoring.api'
import type { QueueMonitoringStreamHandlers } from '@/api/monitoring.api'
import UserService from '@/service/user-service'
import type { QueueMonitoring as QueueMonitoringData } from '@/interfaces/queueMonitoring.interface'

vi.mock('@/api/monitoring.api', () => ({
  getQueueMonitoring: vi.fn(),
  connectQueueMonitoringStream: vi.fn(),
}))
vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn(() => true) } }))

const MB = 1024 * 1024
const generatedAt = '2026-10-01T18:00:00.000Z'
const now = new Date(generatedAt).getTime()

const series = (value: number) => Array<number>(60).fill(value)

function snapshot(overrides: Partial<QueueMonitoringData> = {}): QueueMonitoringData {
  return {
    generatedAt,
    status: 'healthy',
    overview: {
      windowMinutes: 60,
      deliveryTime: { medianMs: 42_000, p95Ms: 130_000, messages: 1240 },
      messagesSent: 1240,
      messagesFailed: 8,
      sendingRate: { perMinute: 36.1, messages: 1180, busySeconds: 1962 },
      failurePercent: 0.6,
      requestsReceived: 38,
    },
    redis: {
      status: 'healthy',
      reasons: [],
      usedMemoryBytes: 300 * MB,
      peakMemoryBytes: 400 * MB,
      maxMemoryBytes: 768 * MB,
      usedMemoryPercent: 39.1,
      maxMemoryPolicy: 'noeviction',
      fragmentationRatio: 1.12,
      evictedKeys: 0,
      rejectedConnections: 0,
      connectedClients: 12,
      blockedClients: 4,
      opsPerSecond: 250,
      uptimeSeconds: 7200,
      version: '7.2.4',
    },
    messages: [
      {
        channel: 'EMAIL',
        pending: 63,
        oldestPendingAgeMs: 50_000,
        sent: series(1),
        failed: series(0),
        sentPerMinute: 21,
        failedPerMinute: 0,
        estimatedClearMinutes: 3,
      },
      {
        channel: 'SMS',
        pending: 0,
        oldestPendingAgeMs: null,
        sent: series(0),
        failed: series(0),
        sentPerMinute: 0,
        failedPerMinute: 0,
        estimatedClearMinutes: 0,
      },
    ],
    activeBatches: [
      {
        queue: 'email-delivery',
        jobId: 'req-1-EMAIL-0',
        notificationId: 'req-1',
        tenantId: 't-1',
        tenantName: 'Health Ministry',
        sent: 37,
        failed: 2,
        total: 100,
        startedAt: new Date(now - 30_000).toISOString(),
      },
    ],
    queues: [
      {
        name: 'email-delivery',
        status: 'healthy',
        reasons: [],
        isPaused: false,
        counts: { waiting: 120, active: 2, delayed: 3, failed: 1, paused: 0 },
        oldestWaitingAgeMs: 45_000,
        throughput: {
          added: series(10),
          completed: series(30),
          failed: series(0),
          inPerMinute: 10,
          outPerMinute: 30,
          failureRatePercent: 0,
        },
        estimatedDrainMinutes: 6,
        liveWorkerPods: 1,
        unheldActiveJobs: 0,
      },
    ],
    workers: [
      {
        podId: 'notify-backend-abc12',
        startedAt: new Date(now - 3_600_000).toISOString(),
        lastHeartbeatAt: new Date(now - 4_000).toISOString(),
        queues: [
          {
            queue: 'email-delivery',
            concurrency: 2,
            active: 2,
            completed: 900,
            failed: 1,
            lastFinishedAt: new Date(now - 2_000).toISOString(),
          },
        ],
      },
    ],
    recentFailures: [
      {
        queue: 'email-delivery',
        jobId: '77',
        notificationId: 'notif-77',
        tenantId: 't-1',
        tenantName: 'Health Ministry',
        reason: 'CHES rejected [email]',
        attemptsMade: 3,
        failedAt: new Date(now - 60_000).toISOString(),
      },
    ],
    ...overrides,
  }
}

const mockedGet = vi.mocked(getQueueMonitoring)

/** The route owns the tab (it lives in the URL); this stands in for it. */
function renderPage(initialTab: MonitoringTab = 'overview') {
  function Harness() {
    const [tab, setTab] = useState<MonitoringTab>(initialTab)
    return <QueueMonitoring tab={tab} onTabChange={setTab} />
  }
  return render(<Harness />)
}
const mockedConnect = vi.mocked(connectQueueMonitoringStream)

/** The handlers the page passed to the most recently opened stream. */
let stream: QueueMonitoringStreamHandlers
let streamController: AbortController

describe('QueueMonitoring', () => {
  beforeEach(() => {
    vi.mocked(UserService.hasRole).mockReturnValue(true)
    mockedGet.mockReset()
    mockedConnect.mockReset().mockImplementation((handlers) => {
      stream = handlers
      streamController = new AbortController()
      return streamController
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows Redis memory against its cap', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()

    const meter = await screen.findByRole('meter', { name: 'Redis memory used' })
    expect(meter).toHaveAttribute('aria-valuenow', '39.1')
    expect(meter).toHaveAttribute('aria-valuetext', '300 MB of 768 MB (39.1%)')
    // Redis internals belong on the System tab, not the overview.
    expect(screen.queryByText('noeviction')).not.toBeInTheDocument()
  })

  it('summarises delivery time, the last hour and the backlog in cards', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()

    const delivery = await screen.findByRole('region', { name: 'Delivery time' })
    expect(within(delivery).getByText('42s median')).toBeInTheDocument()
    expect(within(delivery).getByText('95% within 2m 10s')).toBeInTheDocument()

    const hour = screen.getByRole('region', { name: 'Last hour' })
    expect(within(hour).getByText('1,240 sent')).toBeInTheDocument()
    expect(
      within(hour).getByText('Sends ~36.1/min (measured over 32m 42s of sending)'),
    ).toBeInTheDocument()
    expect(within(hour).getByText('38 requests received')).toBeInTheDocument()
    expect(within(hour).getByText('8 failed (0.6%)')).toBeInTheDocument()

    const backlog = screen.getByRole('region', { name: 'Backlog' })
    expect(within(backlog).getByText('63 pending')).toBeInTheDocument()
    expect(within(backlog).getByText('Clears in ~3 min')).toBeInTheDocument()
  })

  it('says when nothing was sent in the last hour', async () => {
    const data = snapshot()
    data.overview = { ...data.overview, deliveryTime: null }
    mockedGet.mockResolvedValue(data)
    renderPage()

    const delivery = await screen.findByRole('region', { name: 'Delivery time' })
    expect(within(delivery).getByText('Nothing sent in the last hour')).toBeInTheDocument()
  })

  it('counts individual messages, not just jobs', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()

    expect(await screen.findByText('63 messages pending')).toBeInTheDocument()
    expect(screen.getAllByText('Clears in ~3 min').length).toBeGreaterThan(0)

    const table = screen.getByRole('table', { name: 'Right now' })
    const email = within(table).getByRole('row', { name: /Email/ })
    expect(within(email).getByText('63')).toBeInTheDocument()
    expect(within(email).getByText('50s')).toBeInTheDocument()
    expect(within(email).getByText('21/min')).toBeInTheDocument()
    expect(within(email).getByText('~3 min')).toBeInTheDocument()
    const sms = within(table).getByRole('row', { name: /SMS/ })
    expect(within(sms).getByText('Nothing pending')).toBeInTheDocument()
  })

  it('shows per-recipient progress for a batch that is one job', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()

    const table = await screen.findByRole('table', { name: 'Batches in progress' })
    const meter = within(table).getByRole('meter', { name: 'Batch req-1-EMAIL-0 progress' })
    expect(meter).toHaveAttribute('aria-valuenow', '39')
    expect(meter).toHaveAttribute('aria-valuetext', '37 of 100 sent, 2 failed')
    expect(within(table).getByText('Health Ministry')).toBeInTheDocument()
  })

  it('says so when no batch is sending', async () => {
    mockedGet.mockResolvedValue(snapshot({ activeBatches: [] }))
    renderPage()

    expect(
      (await screen.findAllByText('No batches are sending right now.')).length,
    ).toBeGreaterThan(0)
  })

  it('shows each queue with its backlog, rates and drain estimate on the System tab', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage('system')

    const table = await screen.findByRole('table', { name: 'Queues' })
    const row = within(table).getByRole('row', { name: /Email delivery/ })
    expect(within(row).getByText('120')).toBeInTheDocument()
    expect(within(row).getByText('45s')).toBeInTheDocument()
    expect(within(row).getByText('In 10/min')).toBeInTheDocument()
    expect(within(row).getByText('Out 30/min')).toBeInTheDocument()
    expect(within(row).getByText('~6 min')).toBeInTheDocument()
    expect(
      within(row).getByRole('img', { name: /600 added, 1,800 completed, 0 failed/ }),
    ).toBeInTheDocument()
  })

  it('explains why a queue is not healthy, in text as well as colour', async () => {
    const data = snapshot({ status: 'critical' })
    data.queues[0] = {
      ...data.queues[0],
      status: 'critical',
      reasons: ['Jobs are waiting but no pod is processing this queue'],
      estimatedDrainMinutes: null,
      liveWorkerPods: 0,
    }
    mockedGet.mockResolvedValue(data)
    renderPage()

    // Surfaced above the tabs, so a problem is never hidden on a tab you are not looking at.
    expect(
      await screen.findByText(
        'Email delivery: Jobs are waiting but no pod is processing this queue',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Critical').length).toBeGreaterThan(0)

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'View details on the System tab' }))

    const table = await screen.findByRole('table', { name: 'Queues' })
    expect(
      within(table).getByText('Jobs are waiting but no pod is processing this queue'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'View details on the System tab' }),
    ).not.toBeInTheDocument()
  })

  it('lists worker pods and Redis details on the System tab', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage('system')

    const workers = await screen.findByRole('table', { name: 'Workers' })
    expect(within(workers).getByText('notify-backend-abc12')).toBeInTheDocument()
    expect(within(workers).getByText('2 of 2')).toBeInTheDocument()
    expect(screen.getByText('noeviction')).toBeInTheDocument()
    expect(screen.getByText('4 idle workers listening')).toBeInTheDocument()
  })

  it('lists recent failures on the Failures tab, reached from the tab bar', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await screen.findByRole('table', { name: 'Right now' })
    expect(screen.queryByRole('table', { name: 'Recent failed jobs' })).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByText('Failures (1)'))

    const failures = await screen.findByRole('table', { name: 'Recent failed jobs' })
    expect(within(failures).getByText('Health Ministry')).toBeInTheDocument()
    expect(within(failures).getByText('CHES rejected [email]')).toBeInTheDocument()
  })

  it('shows empty states when there are no workers or failures', async () => {
    mockedGet.mockResolvedValue(snapshot({ workers: [], recentFailures: [] }))
    const { unmount } = renderPage('system')
    expect(await screen.findAllByText(/No worker heartbeats received/)).not.toHaveLength(0)
    unmount()

    renderPage('failures')
    expect(await screen.findAllByText('No failed jobs.')).not.toHaveLength(0)
    expect(screen.getByText('Failures (0)')).toBeInTheDocument()
  })

  it('shows a loading message until the first snapshot arrives', () => {
    mockedGet.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByText('Loading queue health…')).toBeInTheDocument()
  })

  it('shows the error when the first load fails', async () => {
    mockedGet.mockRejectedValue(
      new Error('Failed to load queue monitoring: Redis is not configured'),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Redis is not configured')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('keeps the last snapshot on screen when a refresh fails', async () => {
    const user = userEvent.setup()
    mockedGet.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error('Network Error'))
    renderPage()

    await screen.findByRole('table', { name: 'Right now' })
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network Error Showing the last successful snapshot.',
    )
    expect(screen.getByRole('table', { name: 'Right now' })).toBeInTheDocument()
  })

  it('announces a change in overall health but not an unchanged refresh', async () => {
    const user = userEvent.setup()
    mockedGet
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ status: 'warning' }))
    renderPage()
    await screen.findByRole('table', { name: 'Right now' })

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.queryByText(/Queue health changed/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Queue health changed to Warning')).toBeInTheDocument()
  })

  it('refetches when the stream signals a change', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await screen.findByRole('table', { name: 'Right now' })
    act(() => stream.onOpen())
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledTimes(1)

    mockedGet.mockResolvedValue(snapshot({ status: 'warning' }))
    act(() => stream.onChange())

    expect(await screen.findByText('Queue health changed to Warning')).toBeInTheDocument()
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('hides Refresh while the stream is live and brings it back when it drops', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await screen.findByRole('table', { name: 'Right now' })

    act(() => stream.onOpen())
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()

    act(() => stream.onError(false))
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('polls slowly while live and falls back to faster polling when the stream drops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await screen.findByRole('table', { name: 'Right now' })
    act(() => stream.onOpen())

    await act(() => vi.advanceTimersByTimeAsync(FALLBACK_INTERVAL_MS))
    expect(mockedGet).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(BACKSTOP_INTERVAL_MS - FALLBACK_INTERVAL_MS))
    expect(mockedGet).toHaveBeenCalledTimes(2)

    act(() => stream.onError(false))
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(FALLBACK_INTERVAL_MS))
    expect(mockedGet).toHaveBeenCalledTimes(3)
  })

  it('catches up once when the stream reconnects', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await screen.findByRole('table', { name: 'Right now' })
    act(() => stream.onOpen())
    act(() => stream.onError(false))

    act(() => stream.onOpen())

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2))
  })

  it('says when live updates are refused, and keeps polling', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await screen.findByRole('table', { name: 'Right now' })

    act(() => stream.onError(true))

    expect(screen.getByText(/Live updates unavailable/)).toBeInTheDocument()
  })

  it('closes the stream and stops polling when live updates are turned off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockedGet.mockResolvedValue(snapshot())
    renderPage()
    await screen.findByRole('table', { name: 'Right now' })
    const opened = streamController

    await user.click(screen.getByRole('switch', { name: 'Live updates' }))

    expect(opened.signal.aborted).toBe(true)
    expect(screen.getByText('Paused')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(BACKSTOP_INTERVAL_MS * 2))
    expect(mockedGet).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('is not available to users without the NOTIFY_ADMIN role, and never calls the API', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(false)
    renderPage()

    expect(screen.queryByRole('heading', { name: 'Monitoring' })).not.toBeInTheDocument()
    expect(mockedGet).not.toHaveBeenCalled()
    expect(mockedConnect).not.toHaveBeenCalled()
  })
})
