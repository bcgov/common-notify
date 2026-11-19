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
import AdminOverview from './AdminOverview'

describe('AdminOverview', () => {
  beforeEach(() => mockedGet.mockReset())

  it('leaves Redis memory to the System page', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<AdminOverview />)

    await screen.findByRole('region', { name: 'Last hour' })
    expect(screen.queryByRole('meter', { name: 'Redis memory used' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Redis memory' })).not.toBeInTheDocument()
  })

  it('summarises the last hour, the backlog, today, this month and failures, in that order', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<AdminOverview />)

    const hour = await screen.findByRole('region', { name: 'Last hour' })
    expect(within(hour).getByText('1,240 sent')).toBeInTheDocument()
    expect(
      within(hour).getByText('Sends ~36.1/min (measured over 32m 42s of sending)'),
    ).toBeInTheDocument()
    expect(within(hour).getByText('38 requests received')).toBeInTheDocument()
    expect(within(hour).getByText('8 failed (0.6%)')).toBeInTheDocument()

    const backlog = screen.getByRole('region', { name: 'Backlog' })
    expect(within(backlog).getByText('63 pending')).toBeInTheDocument()
    expect(within(backlog).getByText('Clears in ~3 min')).toBeInTheDocument()

    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('1,497 sent')).toBeInTheDocument()
    expect(within(today).getByText('Since midnight, Pacific time')).toBeInTheDocument()

    const month = screen.getByRole('region', { name: 'This month' })
    expect(within(month).getByText('1,497 sent')).toBeInTheDocument()
    expect(within(month).getByText('Since October 1')).toBeInTheDocument()

    const failures = screen.getByRole('region', { name: 'Failures' })
    expect(within(failures).getByText('8 today')).toBeInTheDocument()
    expect(within(failures).getByText('0.5% of today’s messages')).toBeInTheDocument()
    expect(within(failures).getByText('8 in the last hour')).toBeInTheDocument()
    expect(within(failures).getByText('Last failure 12m 0s ago')).toBeInTheDocument()

    const cards = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
      .filter(
        (label) =>
          label && ['Last hour', 'Backlog', 'Today', 'This month', 'Failures'].includes(label),
      )
    expect(cards).toEqual(['Last hour', 'Backlog', 'Today', 'This month', 'Failures'])
  })

  it('says when nothing has failed this month', async () => {
    const data = snapshot()
    data.overview = {
      ...data.overview,
      messagesFailed: 0,
      totals: { ...data.overview.totals, failedToday: 0, lastFailureAt: null },
    }
    mockedGet.mockResolvedValue(data)
    render(<AdminOverview />)

    const failures = await screen.findByRole('region', { name: 'Failures' })
    expect(within(failures).getByText('0 today')).toBeInTheDocument()
    expect(within(failures).getByText('0% of today’s messages')).toBeInTheDocument()
    expect(within(failures).getByText('None this month')).toBeInTheDocument()
  })

  it('lists each component’s status under its group', async () => {
    const data = snapshot()
    data.providers[1] = { ...data.providers[1], status: 'critical' }
    mockedGet.mockResolvedValue(data)
    render(<AdminOverview />)

    const items = async (group: string) =>
      within(await screen.findByRole('list', { name: group }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    expect(await items('Delivery providers')).toEqual(['CHES (Email)Healthy', 'ACS (SMS)Critical'])
    expect(await items('Queues')).toEqual(['Email deliveryHealthy'])
    expect(await items('Supporting services')).toEqual(['RedisHealthy', 'Delivery recoveryHealthy'])
    expect(screen.queryByRole('link', { name: 'Redis' })).not.toBeInTheDocument()
  })

  it('counts individual messages per channel, not just jobs', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<AdminOverview />)

    const table = await screen.findByRole('table', { name: 'Right now' })
    const email = within(table).getByRole('row', { name: /Email/ })
    expect(within(email).getByText('63')).toBeInTheDocument()
    expect(within(email).getByText('50s')).toBeInTheDocument()
    expect(within(email).getByText('21/min')).toBeInTheDocument()
    expect(within(email).getByText('~3 min')).toBeInTheDocument()
    const sms = within(table).getByRole('row', { name: /SMS/ })
    expect(within(sms).getByText('Nothing pending')).toBeInTheDocument()
  })

  it('lists recent failures', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<AdminOverview />)

    const failures = await screen.findByRole('table', { name: 'Recent failed jobs' })
    expect(within(failures).getByText('Health Ministry')).toBeInTheDocument()
    expect(within(failures).getByText('CHES rejected [email]')).toBeInTheDocument()
  })

  it('says so when nothing has failed', async () => {
    mockedGet.mockResolvedValue(snapshot({ recentFailures: [] }))
    render(<AdminOverview />)

    expect(await screen.findAllByText('No failed jobs.')).not.toHaveLength(0)
  })

  it('leaves queue and worker detail to System', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<AdminOverview />)

    await screen.findByRole('table', { name: 'Right now' })
    expect(screen.queryByRole('table', { name: 'Queues' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Workers' })).not.toBeInTheDocument()
  })
})
