import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QueueMonitoring, { REFRESH_INTERVAL_MS } from './QueueMonitoring'
import { getQueueMonitoring } from '@/api/monitoring.api'
import UserService from '@/service/user-service'
import type { QueueMonitoring as QueueMonitoringData } from '@/interfaces/queueMonitoring.interface'

vi.mock('@/api/monitoring.api', () => ({ getQueueMonitoring: vi.fn() }))
vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn(() => true) } }))

const MB = 1024 * 1024
const generatedAt = '2026-10-01T18:00:00.000Z'
const now = new Date(generatedAt).getTime()

const series = (value: number) => Array<number>(60).fill(value)

function snapshot(overrides: Partial<QueueMonitoringData> = {}): QueueMonitoringData {
  return {
    generatedAt,
    status: 'healthy',
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

describe('QueueMonitoring', () => {
  beforeEach(() => {
    vi.mocked(UserService.hasRole).mockReturnValue(true)
    mockedGet.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows Redis memory against its cap', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<QueueMonitoring />)

    const meter = await screen.findByRole('meter', { name: 'Redis memory used' })
    expect(meter).toHaveAttribute('aria-valuenow', '39.1')
    expect(meter).toHaveAttribute('aria-valuetext', '300 MB of 768 MB (39.1%)')
    expect(screen.getByText('noeviction')).toBeInTheDocument()
  })

  it('shows each queue with its backlog, rates and drain estimate', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<QueueMonitoring />)

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
    render(<QueueMonitoring />)

    expect(
      await screen.findByText('Jobs are waiting but no pod is processing this queue'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Critical').length).toBeGreaterThan(0)
    expect(screen.getByText('Not draining: Email delivery')).toBeInTheDocument()
  })

  it('lists worker pods and recent failures', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<QueueMonitoring />)

    const workers = await screen.findByRole('table', { name: 'Workers' })
    expect(within(workers).getByText('notify-backend-abc12')).toBeInTheDocument()
    expect(within(workers).getByText('2 of 2')).toBeInTheDocument()

    const failures = screen.getByRole('table', { name: 'Recent failed jobs' })
    expect(within(failures).getByText('Health Ministry')).toBeInTheDocument()
    expect(within(failures).getByText('CHES rejected [email]')).toBeInTheDocument()
  })

  it('shows empty states when there are no workers or failures', async () => {
    mockedGet.mockResolvedValue(snapshot({ workers: [], recentFailures: [] }))
    render(<QueueMonitoring />)

    expect(await screen.findAllByText(/No worker heartbeats received/)).not.toHaveLength(0)
    expect(screen.getAllByText('No failed jobs.')).not.toHaveLength(0)
  })

  it('shows a loading message until the first snapshot arrives', () => {
    mockedGet.mockReturnValue(new Promise(() => {}))
    render(<QueueMonitoring />)

    expect(screen.getByText('Loading queue health…')).toBeInTheDocument()
  })

  it('shows the error when the first load fails', async () => {
    mockedGet.mockRejectedValue(
      new Error('Failed to load queue monitoring: Redis is not configured'),
    )
    render(<QueueMonitoring />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Redis is not configured')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('keeps the last snapshot on screen when a refresh fails', async () => {
    const user = userEvent.setup()
    mockedGet.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error('Network Error'))
    render(<QueueMonitoring />)

    await screen.findByRole('table', { name: 'Queues' })
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network Error Showing the last successful snapshot.',
    )
    expect(screen.getByRole('table', { name: 'Queues' })).toBeInTheDocument()
  })

  it('announces a change in overall health but not an unchanged refresh', async () => {
    const user = userEvent.setup()
    mockedGet
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ status: 'warning' }))
    render(<QueueMonitoring />)
    await screen.findByRole('table', { name: 'Queues' })

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.queryByText(/Queue health changed/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Queue health changed to Warning')).toBeInTheDocument()
  })

  it('polls on an interval and stops when auto-refresh is turned off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockedGet.mockResolvedValue(snapshot())
    render(<QueueMonitoring />)
    await screen.findByRole('table', { name: 'Queues' })
    expect(mockedGet).toHaveBeenCalledTimes(1)

    await act(() => vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS))
    expect(mockedGet).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('switch', { name: /Auto-refresh/ }))
    await act(() => vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3))
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('is not available to users without the NOTIFY_ADMIN role, and never calls the API', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(false)
    render(<QueueMonitoring />)

    expect(screen.queryByRole('heading', { name: 'Monitoring' })).not.toBeInTheDocument()
    expect(mockedGet).not.toHaveBeenCalled()
  })
})
