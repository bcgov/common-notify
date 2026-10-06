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
    sendsInProgress: [
      {
        notificationId: 'req-1',
        tenantId: 't-1',
        tenantName: 'Health Ministry',
        channels: ['EMAIL'],
        acceptedAt: new Date(now - 300_000).toISOString(),
        total: 2000,
        sent: 398,
        failed: 2,
        remaining: 1600,
        batches: 80,
        batchesDone: 16,
        batchesSending: 20,
        perMinute: 64,
        estimatedMinutesLeft: 25,
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
        draining: false,
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
    providers: [
      {
        name: 'CHES',
        channel: 'EMAIL',
        status: 'healthy',
        reasons: [],
        circuit: 'closed',
        reopensAt: null,
        inFlight: 3,
        limit: 5,
      },
      {
        name: 'ACS',
        channel: 'SMS',
        status: 'healthy',
        reasons: [],
        circuit: 'closed',
        reopensAt: null,
        inFlight: null,
        limit: null,
      },
    ],
    reconciler: {
      status: 'healthy',
      reasons: [],
      lastPassAt: new Date(now - 20_000).toISOString(),
      intervalMs: 60_000,
      lastPassDurationMs: 35,
      lastPassFound: 4,
      windowMinutes: 60,
      retried: 1,
      requeued: 3,
      gaveUp: 0,
      recentActions: [
        {
          at: new Date(now - 120_000).toISOString(),
          kind: 'scheduled',
          action: 'requeued',
          jobId: 'notif-90',
          notificationId: 'notif-90',
          tenantId: 't-1',
          tenantName: 'Health Ministry',
        },
      ],
    },
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

  it('rolls a merge send up into one row with its batches and time left', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage()

    const table = await screen.findByRole('table', { name: 'Sends in progress' })
    const meter = within(table).getByRole('meter', { name: 'Notification req-1 progress' })
    expect(meter).toHaveAttribute('aria-valuenow', '20')
    expect(meter).toHaveAttribute('aria-valuetext', '398 of 2,000 sent, 2 failed')
    expect(within(table).getByText('16 of 80 done, 20 sending, 44 waiting')).toBeInTheDocument()
    expect(within(table).getByText('~25 min at 64/min')).toBeInTheDocument()
    expect(within(table).getByText('Health Ministry')).toBeInTheDocument()
  })

  it('shows a plain send without batches, and one not sending yet', async () => {
    const data = snapshot()
    data.sendsInProgress = [
      {
        ...data.sendsInProgress[0],
        batches: 0,
        batchesDone: 0,
        batchesSending: 0,
        perMinute: 0,
        estimatedMinutesLeft: null,
      },
    ]
    mockedGet.mockResolvedValue(data)
    renderPage()

    const table = await screen.findByRole('table', { name: 'Sends in progress' })
    expect(within(table).getByText('Not sending yet')).toBeInTheDocument()
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('says so when nothing is sending', async () => {
    mockedGet.mockResolvedValue(snapshot({ sendsInProgress: [] }))
    renderPage()

    expect((await screen.findAllByText('Nothing is sending right now.')).length).toBeGreaterThan(0)
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

  it('hides fragmentation at low memory use and flags it when high on a busy instance', async () => {
    mockedGet.mockResolvedValue(snapshot())
    const { unmount } = renderPage('system')
    // 300 MB used in the default snapshot: meaningful, and 1.12 is normal.
    expect(await screen.findByText('1.12')).toBeInTheDocument()
    unmount()

    const small = snapshot()
    small.redis = { ...small.redis, usedMemoryBytes: 45 * MB, fragmentationRatio: 2.76 }
    mockedGet.mockResolvedValue(small)
    const second = renderPage('system')
    expect(await screen.findByText('Not meaningful at low memory use')).toBeInTheDocument()
    expect(screen.queryByText('2.76')).not.toBeInTheDocument()
    second.unmount()

    const fragmented = snapshot()
    fragmented.redis = { ...fragmented.redis, fragmentationRatio: 2.4 }
    mockedGet.mockResolvedValue(fragmented)
    renderPage('system')
    expect(await screen.findByText('2.40')).toBeInTheDocument()
    expect(
      screen.getByText('High: Redis holds more memory than its data needs'),
    ).toBeInTheDocument()
  })

  it('shows what the delivery reconciler recovered on the System tab', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage('system')

    const recoveries = await screen.findByRole('table', { name: 'Recent recoveries' })
    expect(within(recoveries).getByText('Re-queued')).toBeInTheDocument()
    expect(within(recoveries).getByText('Scheduled send')).toBeInTheDocument()
    expect(within(recoveries).getByText('notif-90')).toBeInTheDocument()
    expect(screen.getByText('Every 1m 0s; checked 4')).toBeInTheDocument()
  })

  it('raises reconciler warnings in the banner and says when it has not run yet', async () => {
    const data = snapshot()
    data.reconciler = {
      ...data.reconciler,
      status: 'warning',
      reasons: ['Gave up on 2 stuck send(s) in the last 60 min; what they owed is marked failed'],
      lastPassAt: null,
      intervalMs: null,
      lastPassFound: null,
      recentActions: [],
    }
    mockedGet.mockResolvedValue(data)
    renderPage()

    expect(
      await screen.findByText(
        'Delivery recovery: Gave up on 2 stuck send(s) in the last 60 min; what they owed is marked failed',
      ),
    ).toBeInTheDocument()
    await userEvent.setup().click(screen.getByText('View details on the System tab'))
    expect(await screen.findByText('Not run yet')).toBeInTheDocument()
    expect(screen.getAllByText('Nothing has needed recovering.')).not.toHaveLength(0)
  })

  it('shows each provider sending normally, with CHES requests in flight, on the System tab', async () => {
    mockedGet.mockResolvedValue(snapshot())
    renderPage('system')

    expect(await screen.findByText('CHES (Email)')).toBeInTheDocument()
    expect(screen.getByText('ACS (SMS)')).toBeInTheDocument()
    expect(screen.getAllByText('Sending')).toHaveLength(2)
    expect(screen.getByText('3 of 5')).toBeInTheDocument()
    // ACS has no concurrency cap, so no in-flight tile.
    expect(screen.getAllByText('Requests in flight')).toHaveLength(1)
  })

  it('raises a paused provider in the banner and on the System tab', async () => {
    const data = snapshot()
    data.providers = [
      data.providers[0],
      {
        ...data.providers[1],
        status: 'warning',
        reasons: ['Failing; sends are waiting, and resume once a test send succeeds'],
        circuit: 'open',
        reopensAt: '2026-10-01T18:00:30.000Z',
      },
    ]
    mockedGet.mockResolvedValue(data)
    renderPage('system')

    expect(
      await screen.findByText(
        'ACS (SMS): Failing; sends are waiting, and resume once a test send succeeds',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Paused: provider failing')).toBeInTheDocument()
    expect(screen.getByText(/^Test send at /)).toBeInTheDocument()
  })

  it('labels a pod that is shutting down', async () => {
    const data = snapshot()
    data.workers = [{ ...data.workers[0], draining: true }]
    mockedGet.mockResolvedValue(data)
    renderPage('system')

    const workers = await screen.findByRole('table', { name: 'Workers' })
    expect(within(workers).getByText('Shutting down')).toBeInTheDocument()
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
