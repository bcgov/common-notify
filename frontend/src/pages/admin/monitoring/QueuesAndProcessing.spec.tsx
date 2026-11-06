import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { getQueueMonitoring } from '@/api/monitoring.api'
import { snapshot } from './monitoring.fixture'

vi.mock('@/api/monitoring.api', () => ({
  getQueueMonitoring: vi.fn(),
  connectQueueMonitoringStream: vi.fn(() => new AbortController()),
}))
vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn(() => true) } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

const mockedGet = vi.mocked(getQueueMonitoring)
import QueuesAndProcessing from './QueuesAndProcessing'

describe('QueuesAndProcessing', () => {
  beforeEach(() => mockedGet.mockReset())

  it('shows each queue with its backlog, rates and drain estimate', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<QueuesAndProcessing />)

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
    render(<QueuesAndProcessing />)

    expect(
      await screen.findByText(
        'Email delivery: Jobs are waiting but no pod is processing this queue',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Critical').length).toBeGreaterThan(0)
    const table = screen.getByRole('table', { name: 'Queues' })
    expect(
      within(table).getByText('Jobs are waiting but no pod is processing this queue'),
    ).toBeInTheDocument()
  })

  it('rolls a merge send up into one row with its batches and time left', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<QueuesAndProcessing />)

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
    render(<QueuesAndProcessing />)

    const table = await screen.findByRole('table', { name: 'Sends in progress' })
    expect(within(table).getByText('Not sending yet')).toBeInTheDocument()
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('says so when nothing is sending', async () => {
    mockedGet.mockResolvedValue(snapshot({ sendsInProgress: [] }))
    render(<QueuesAndProcessing />)

    expect((await screen.findAllByText('Nothing is sending right now.')).length).toBeGreaterThan(0)
  })

  it('lists worker pods, and labels one that is shutting down', async () => {
    mockedGet.mockResolvedValue(snapshot())
    const { unmount } = render(<QueuesAndProcessing />)

    const workers = await screen.findByRole('table', { name: 'Workers' })
    expect(within(workers).getByText('notify-backend-abc12')).toBeInTheDocument()
    expect(within(workers).getByText('2 of 2')).toBeInTheDocument()
    unmount()

    const data = snapshot()
    data.workers = [{ ...data.workers[0], draining: true }]
    mockedGet.mockResolvedValue(data)
    render(<QueuesAndProcessing />)
    const draining = await screen.findByRole('table', { name: 'Workers' })
    expect(within(draining).getByText('Shutting down')).toBeInTheDocument()
  })

  it('says when no worker has reported in', async () => {
    mockedGet.mockResolvedValue(snapshot({ workers: [] }))
    render(<QueuesAndProcessing />)

    expect(await screen.findAllByText(/No worker heartbeats received/)).not.toHaveLength(0)
  })

  it('shows what the delivery reconciler recovered', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<QueuesAndProcessing />)

    const recoveries = await screen.findByRole('table', { name: 'Recent recoveries' })
    expect(within(recoveries).getByText('Re-queued')).toBeInTheDocument()
    expect(within(recoveries).getByText('Scheduled send')).toBeInTheDocument()
    expect(within(recoveries).getByText('notif-90')).toBeInTheDocument()
    expect(screen.getByText('Every 1m 0s; checked 4')).toBeInTheDocument()
  })

  it('raises reconciler warnings and says when it has not run yet', async () => {
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
    render(<QueuesAndProcessing />)

    expect(
      await screen.findByText(
        'Delivery recovery: Gave up on 2 stuck send(s) in the last 60 min; what they owed is marked failed',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Not run yet')).toBeInTheDocument()
    expect(screen.getAllByText('Nothing has needed recovering.')).not.toHaveLength(0)
  })
})
