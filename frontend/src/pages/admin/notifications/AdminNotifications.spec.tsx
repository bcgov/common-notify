import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent, within } from '@/test-utils'
import type * as Router from '@tanstack/react-router'
import reducer, { setFilter, setSearch } from '@/redux/slices/adminNotifications.slice'
import { showErrorToast } from '@/redux/utils/toastUtils'
import AdminNotifications from './AdminNotifications'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  dispatch: vi.fn(),
  navigate: vi.fn(),
}))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mocks.state),
  useAppDispatch: () => mocks.dispatch,
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  useNavigate: () => mocks.navigate,
}))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn() }))

const row = {
  id: 'req-1',
  tenantId: 't-1',
  tenantName: 'Parks Booking',
  status: { code: 'failed', displayName: 'Failed' },
  channels: ['EMAIL'],
  requestRoute: 'notifysimple',
  createdAt: '2026-11-10T10:00:00.000Z',
  scheduledFor: null,
  recipientCount: 1200,
  failedCount: 3,
}

function setup(overrides = {}) {
  mocks.state = {
    adminNotifications: { ...reducer(undefined, { type: 'init' }), hasLoaded: true, ...overrides },
    adminTenants: {
      items: [
        { id: 't-1', name: 'Parks Booking' },
        { id: 't-2', name: 'Roads' },
      ],
    },
    codeTables: {
      statuses: [
        { id: 'failed', label: 'Failed' },
        { id: 'queued', label: 'Queued' },
      ],
    },
  }
  return render(<AdminNotifications />)
}

describe('AdminNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists requests across tenants without recipient addresses', () => {
    setup({ items: [row], count: 1 })

    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Notifications' })
    const cells = within(table).getAllByRole('row')[1].querySelectorAll('td')
    expect([...cells].map((cell) => cell.textContent)).toEqual([
      expect.stringContaining('2026'),
      'Parks Booking',
      'notifysimple',
      expect.stringContaining('Email'),
      'Failed',
      '1,200',
      '3',
    ])
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it('opens a request from its row, by mouse or keyboard', async () => {
    setup({ items: [row], count: 1 })
    const target = {
      to: '/admin/notifications/$notificationRequestId',
      params: { notificationRequestId: 'req-1' },
    }

    await userEvent.click(screen.getByText('Parks Booking'))
    expect(mocks.navigate).toHaveBeenCalledWith(target)

    mocks.navigate.mockClear()
    screen.getAllByRole('row')[1].focus()
    await userEvent.keyboard('{Enter}')
    expect(mocks.navigate).toHaveBeenCalledWith(target)
  })

  it('suggests tenant names and searches for the one picked', async () => {
    setup()

    await userEvent.type(screen.getByRole('combobox', { name: 'Search by tenant' }), 'park')
    await userEvent.click(
      within(screen.getByRole('listbox')).getByRole('option', { name: 'Parks Booking' }),
    )

    expect(mocks.dispatch).toHaveBeenCalledWith(setSearch('Parks Booking'))
  })

  it('filters by status from the Status column', async () => {
    setup({ items: [row], count: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'Column options for Status' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Filter by/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Failed' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(mocks.dispatch).toHaveBeenCalledWith(setFilter({ field: 'status', values: ['failed'] }))
  })

  it('shows the date range it is filtering on', () => {
    setup({ from: '2026-11-01', to: '2026-11-07' })

    expect(screen.getByRole('group', { name: 'Received from' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Received to' })).toBeInTheDocument()
  })

  it('says when nothing matches, and reports a failed load', () => {
    setup({ items: [], count: 0, error: 'Failed to load notifications: down' })

    const table = screen.getByRole('table', { name: 'Notifications' })
    expect(within(table).getByText('No notifications in this date range')).toBeInTheDocument()
    expect(showErrorToast).toHaveBeenCalledWith(
      'Failed to load notifications: down',
      undefined,
      expect.objectContaining({ toastId: 'admin-notifications-error' }),
    )
  })
})
