import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent } from '@/test-utils'
import reducer, {
  setSearch,
  setLimit,
  setPage,
  setSort,
  setFilter,
} from '@/redux/slices/notificationDetail.slice'
import { showErrorToast } from '@/redux/utils/toastUtils'
import RequestStatus from './RequestStatus'

const mocks = vi.hoisted(() => ({ state: {} as Record<string, unknown>, dispatch: vi.fn() }))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mocks.state),
  useAppDispatch: () => mocks.dispatch,
}))
vi.mock('@/components/PageHeading', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn() }))

function setup(overrides = {}) {
  mocks.state = { notificationDetail: { ...reducer(undefined, { type: 'init' }), ...overrides } }
  return render(<RequestStatus notificationRequestId="request-1" />)
}
describe('RequestStatus', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows an empty delivery table', () => {
    setup()
    expect(screen.getAllByText('No delivery records found')[0]).toBeInTheDocument()
    expect(mocks.dispatch).toHaveBeenCalledTimes(2)
  })
  it('shows initial loading', () => {
    setup({ isLoading: true })
    expect(screen.getAllByText(/Loading/)[0]).toBeInTheDocument()
    expect(screen.queryByText('No delivery records found')).not.toBeInTheDocument()
  })
  it('reports errors even when previous rows are retained', () => {
    setup({ error: 'Delivery lookup failed' })
    expect(showErrorToast).toHaveBeenCalledWith('Delivery lookup failed', undefined, {
      toastId: 'notification-detail-error',
    })
  })
  it('commits recipient searches', async () => {
    setup()
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search delivery records' }),
      'alice{Enter}',
    )
    expect(mocks.dispatch).toHaveBeenCalledWith(setSearch('alice'))
  })
  it('renders delivery results and keeps them visible during background refresh', () => {
    setup({
      notificationRequest: {
        id: 'request-1',
        requestRoute: 'Renewals',
        channelCodes: ['EMAIL'],
        recipients: { email: ['alice@example.com'], sms: ['123'] },
        createdAt: '2026-01-01',
        status: { code: 'sent', displayName: 'Sent' },
      },
      items: [
        {
          id: 'detail',
          recipientAddress: 'alice@example.com',
          channel: 'EMAIL',
          status: 'failed',
          errorMessage: 'Mailbox unavailable',
        },
      ],
      isLoading: true,
      hasLoaded: true,
    })
    expect(screen.getByRole('heading', { name: 'Renewals' })).toBeInTheDocument()
    expect(screen.getAllByText('alice@example.com')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Mailbox unavailable')[0]).toBeInTheDocument()
    expect(screen.queryByText('Loading')).not.toBeInTheDocument()
  })
  it('dispatches pagination, sorting, filters and clear search', async () => {
    setup({
      count: 45,
      items: [{ id: 'detail', recipientAddress: 'alice', channel: 'EMAIL', status: 'sent' }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(setPage(2))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Items per page' }), '30')
    expect(mocks.dispatch).toHaveBeenCalledWith(setLimit(30))
    await userEvent.click(screen.getByRole('button', { name: 'Column options for Recipient' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'A to Z' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(
      setSort({ sortBy: 'recipientAddress', sortOrder: 'asc' }),
    )
    await userEvent.click(screen.getByRole('button', { name: /Status.*options|options.*Status/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Filter by/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Failed' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(setFilter({ field: 'status', values: ['failed'] }))
  })
  it('clears committed search text', async () => {
    setup({ search: 'alice' })
    await userEvent.click(screen.getByRole('button', { name: /Clear search/i }))
    expect(mocks.dispatch).toHaveBeenCalledWith(setSearch(''))
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })
})
