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

  it('shows Redis memory against its cap', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<AdminOverview />)

    const meter = await screen.findByRole('meter', { name: 'Redis memory used' })
    expect(meter).toHaveAttribute('aria-valuenow', '39.1')
    expect(meter).toHaveAttribute('aria-valuetext', '300 MB of 768 MB (39.1%)')
    // Redis internals belong on Service health, not the overview.
    expect(screen.queryByText('noeviction')).not.toBeInTheDocument()
  })

  it('summarises delivery time, the last hour and the backlog in cards', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<AdminOverview />)

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
    render(<AdminOverview />)

    const delivery = await screen.findByRole('region', { name: 'Delivery time' })
    expect(within(delivery).getByText('Nothing sent in the last hour')).toBeInTheDocument()
  })

  it('lists each component’s status, linking to the page with its details', async () => {
    const data = snapshot()
    data.providers[1] = { ...data.providers[1], status: 'critical' }
    mockedGet.mockResolvedValue(data)
    render(<AdminOverview />)

    const list = await screen.findByRole('list', { name: 'Component status' })
    const rows = within(list)
      .getAllByRole('listitem')
      .map((item) => [
        within(item).getByRole('link').textContent,
        within(item).getByRole('link').getAttribute('href'),
        item.textContent?.replace(within(item).getByRole('link').textContent ?? '', ''),
      ])
    expect(rows).toEqual([
      ['CHES (Email)', '/admin/health', 'Healthy'],
      ['ACS (SMS)', '/admin/health', 'Critical'],
      ['Redis', '/admin/health', 'Healthy'],
      ['Email delivery', '/admin/monitoring', 'Healthy'],
      ['Delivery recovery', '/admin/monitoring', 'Healthy'],
    ])
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

  it('leaves queue and worker detail to Queues & processing', async () => {
    mockedGet.mockResolvedValue(snapshot())
    render(<AdminOverview />)

    await screen.findByRole('table', { name: 'Right now' })
    expect(screen.queryByRole('table', { name: 'Queues' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Workers' })).not.toBeInTheDocument()
  })
})
