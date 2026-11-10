import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent, waitFor, within } from '@/test-utils'
import type * as Router from '@tanstack/react-router'
import { getAdminNotification, listAdminDeliveries } from '@/api/adminNotifications.api'
import type { AdminNotificationDetail as Detail } from '@/api/adminNotifications.api'
import AdminNotificationDetail from './AdminNotificationDetail'

vi.mock('@/api/adminNotifications.api', () => ({
  getAdminNotification: vi.fn(),
  listAdminDeliveries: vi.fn(),
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn() }))

const detail: Detail = {
  id: 'req-1',
  tenantId: 't-1',
  tenantName: 'Parks Booking',
  status: { code: 'failed', displayName: 'Failed' },
  channels: ['EMAIL'],
  requestRoute: 'notifysimple',
  createdAt: '2026-11-10T10:00:00.000Z',
  scheduledFor: null,
  updatedAt: '2026-11-10T10:05:00.000Z',
  recipientCount: 2,
  failedCount: 2,
  errorReason: 'CHES rejected [recipient]',
  quarantine: null,
  deliveryCounts: [{ channel: 'EMAIL', status: 'failed', count: 2 }],
  statusHistory: [
    { status: 'queued', at: '2026-11-10T10:00:00.000Z' },
    { status: 'failed', at: '2026-11-10T10:05:00.000Z' },
  ],
  logsUrl: 'https://grafana.example/explore?left=x',
}

const delivery = {
  id: 'd-1',
  channel: 'EMAIL',
  status: 'failed',
  attemptCount: 3,
  lastAttemptAt: '2026-11-10T10:04:00.000Z',
  errorMessage: '550 mailbox [recipient] unavailable',
  providerResponseId: 'msg-9',
  providerResponse: '{"code":550}',
}

describe('AdminNotificationDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAdminNotification).mockResolvedValue(detail)
    vi.mocked(listAdminDeliveries).mockResolvedValue({
      data: [delivery],
      count: 1,
      page: 1,
      limit: 15,
      totalPages: 1,
    })
  })

  it('shows the request, its error, status history and a link to its logs', async () => {
    render(<AdminNotificationDetail notificationRequestId="req-1" />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Parks Booking' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Request ID: req-1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'href',
      '/admin/notifications',
    )
    expect(screen.getByText('CHES rejected [recipient]')).toBeInTheDocument()

    const logs = screen.getByRole('link', { name: 'View logs in Loki (opens in a new tab)' })
    expect(logs).toHaveAttribute('href', detail.logsUrl)
    expect(logs).toHaveAttribute('target', '_blank')

    const history = screen.getByRole('region', { name: 'Status history' })
    expect(
      within(history)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining('Queued'), expect.stringContaining('Failed')])
  })

  it("lists each delivery's attempts and redacted error", async () => {
    render(<AdminNotificationDetail notificationRequestId="req-1" />)

    const table = await screen.findByRole('table', { name: 'Deliveries' })
    await within(table).findByText('550 mailbox [recipient] unavailable')
    expect(within(table).getByText('ID: msg-9')).toBeInTheDocument()
    expect(within(table).getByText('3')).toBeInTheDocument()
    expect(listAdminDeliveries).toHaveBeenCalledWith('req-1', {
      page: 1,
      limit: 15,
      filter: undefined,
    })
  })

  it('refetches deliveries filtered by status', async () => {
    render(<AdminNotificationDetail notificationRequestId="req-1" />)
    await screen.findByText('550 mailbox [recipient] unavailable')

    await userEvent.click(screen.getByRole('button', { name: 'Column options for Status' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Filter by/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Failed' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() =>
      expect(listAdminDeliveries).toHaveBeenLastCalledWith('req-1', {
        page: 1,
        limit: 15,
        filter: ['status:in:failed'],
      }),
    )
  })

  it('has no logs link where there are no logs, and no error section without an error', async () => {
    vi.mocked(getAdminNotification).mockResolvedValue({
      ...detail,
      logsUrl: null,
      errorReason: null,
    })
    render(<AdminNotificationDetail notificationRequestId="req-1" />)

    await screen.findByRole('heading', { level: 1, name: 'Parks Booking' })
    expect(screen.queryByRole('link', { name: /View logs/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Error' })).not.toBeInTheDocument()
  })

  it('reports a request that cannot be loaded', async () => {
    vi.mocked(getAdminNotification).mockRejectedValue(
      new Error('The notification could not be found'),
    )
    render(<AdminNotificationDetail notificationRequestId="req-1" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The notification could not be found',
    )
  })
})
