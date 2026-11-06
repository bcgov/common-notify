import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent, waitFor, fireEvent, within } from '@/test-utils'
import reducer, { setAdminFilter, setAdminSearch } from '@/redux/slices/apiKeyUsage.slice'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import AdminUsage from './AdminUsage'
import { updateTenantLimits } from '@/redux/thunks/apiKeyUsage.thunks'
import type * as UsageThunks from '@/redux/thunks/apiKeyUsage.thunks'
import { getAdminUsageSummary } from '@/api/apiKeyUsage.api'
import type * as UsageApi from '@/api/apiKeyUsage.api'

vi.mock('@/api/apiKeyUsage.api', async (importOriginal) => ({
  ...(await importOriginal<typeof UsageApi>()),
  getAdminUsageSummary: vi.fn(),
}))
vi.mock('@/redux/thunks/apiKeyUsage.thunks', async (importOriginal) => {
  const actual = await importOriginal<typeof UsageThunks>()
  return { ...actual, updateTenantLimits: vi.fn(actual.updateTenantLimits) }
})

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  dispatch: vi.fn(),
  admin: true,
  save: vi.fn(),
}))
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mocks.state),
  useAppDispatch: () => mocks.dispatch,
}))
vi.mock('@/service/user-service', () => ({ default: { hasRole: () => mocks.admin } }))
vi.mock('@/components/NotAuthorized', () => ({ default: () => <div>Not authorized</div> }))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }))

const row = {
  tenantId: 'tenant',
  tenantName: 'Test Tenant',
  channel: 'SMS',
  dailyLimit: 100,
  annualLimit: 1000,
  warnThresholdPercent: 80,
  usedToday: 20,
  usedThisYear: 30,
  usedThisMinute: 0,
  rateLimitPerMinute: 10,
  lastSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  averageMonthlySends: 1240,
}
let usageState: ReturnType<typeof reducer>
function setup(overrides = {}, roles = ['NOTIFY_OPERATIONS_ADMIN']) {
  usageState = { ...reducer(undefined, { type: 'init' }), ...overrides }
  mocks.state = {
    apiKeyUsage: usageState,
    tenant: { selectedTenant: { id: 'tenant' } },
    user: { current: { cstarRoles: roles } },
  }
  return render(<AdminUsage />)
}

describe('AdminUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin = true
    mocks.save.mockResolvedValue(undefined)
    mocks.dispatch.mockReturnValue({ unwrap: () => mocks.save() })
    vi.mocked(getAdminUsageSummary).mockResolvedValue({
      tenants: 42,
      sentThisFiscalYear: 30,
      withApiKey: 12,
    })
  })
  it('summarises how many tenants use Notify under the heading', async () => {
    setup()
    expect(
      await screen.findByText(
        '42 tenants use Notify · 30 sent this fiscal year · 12 with an API key',
      ),
    ).toBeInTheDocument()
    expect(getAdminUsageSummary).toHaveBeenCalledTimes(1)
  })
  it('raises a failed summary as an error toast and still shows the table', async () => {
    vi.mocked(getAdminUsageSummary).mockRejectedValue(new Error('Failed to load tenant summary'))
    setup({ adminRows: [row], adminCount: 1 })
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith('Failed to load tenant summary'),
    )
    expect(screen.getByRole('row', { name: /Test Tenant/ })).toBeInTheDocument()
  })
  it('shows the empty state', () => {
    setup()
    expect(screen.getAllByText('No tenants found.')[0]).toBeInTheDocument()
  })
  it('shows a channel with no limits as unset, with nothing to edit', () => {
    const unset = {
      ...row,
      dailyLimit: null,
      annualLimit: null,
      warnThresholdPercent: null,
      rateLimitPerMinute: null,
      usedToday: 0,
      usedThisYear: 0,
      lastSentAt: null,
      averageMonthlySends: null,
    }
    setup({ adminRows: [unset], adminCount: 1 })
    const tenantRow = screen.getByRole('row', { name: /Test Tenant/ })
    const cells = within(tenantRow)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
    expect(cells).toEqual([
      'Test Tenant',
      'Sms',
      'Never',
      '—No full month of sending yet',
      '0 / Not set',
      '0 / Not set',
      'Not set',
      'No limits to edit',
    ])
    expect(screen.queryByRole('button', { name: 'Edit limits' })).not.toBeInTheDocument()
  })
  it('shows when each channel last sent and its monthly average', () => {
    setup({ adminRows: [row], adminCount: 1 })
    const tenantRow = screen.getByRole('row', { name: /Test Tenant/ })
    const lastSent = within(tenantRow).getByText('3 days ago')
    expect(lastSent.tagName).toBe('TIME')
    expect(lastSent).toHaveAttribute('dateTime', row.lastSentAt)
    expect(within(tenantRow).getByText('1,240')).toBeInTheDocument()
  })
  it('shows loading instead of empty content', () => {
    setup({ adminLoading: true })
    expect(screen.queryByText('No tenants found.')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Loading/)[0]).toBeInTheDocument()
  })
  it('shows failed loads', () => {
    setup({ adminError: 'Service unavailable' })
    expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable')
  })
  it('allows authorized users to edit and save', async () => {
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Edit limits' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily maximum' }), {
      target: { value: '60' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled())
    expect(updateTenantLimits).toHaveBeenCalledWith({
      tenantId: 'tenant',
      channel: 'SMS',
      dailyLimit: 60,
      annualLimit: 1000,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('validates numeric input without saving', async () => {
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Edit limits' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily maximum' }), {
      target: { value: '0' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(showErrorToast).toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it.each(['Save unavailable', new Error('failure')])('reports save errors: %s', async (error) => {
    mocks.save.mockRejectedValue(error)
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Edit limits' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith(
        typeof error === 'string' ? error : 'Failed to update limits',
      ),
    )
    expect(screen.getByRole('spinbutton', { name: 'Daily maximum' })).toBeInTheDocument()
  })
  it('commits a trimmed tenant search when Search is pressed', async () => {
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tenants' }), '  Parks ')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(setAdminSearch('Parks'))
  })
  it('offers to clear a search that matches no tenants', async () => {
    setup({ adminSearch: 'nothing' })
    expect(
      screen.getByRole('cell', { name: /^No results found. Try a different search./ }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(setAdminSearch(''))
    expect(screen.getByRole('searchbox', { name: 'Search tenants' })).toHaveValue('')
  })
  it('filters by channel from the Channel column', async () => {
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Column options for Channel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Filter by/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'SMS' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(
      setAdminFilter({ field: 'channel', values: ['SMS'] }),
    )
  })
  it('offers to clear a channel filter that matches no tenants', async () => {
    setup({ adminFilters: { channel: ['EMAIL'] } })
    expect(
      screen.getByRole('cell', { name: /^No data match the filters applied./ }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(setAdminFilter({ field: 'channel', values: [] }))
  })
  it('denies users without the administrator role and does not fetch', () => {
    mocks.admin = false
    setup()
    expect(screen.getAllByText('Not authorized')[0]).toBeInTheDocument()
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(getAdminUsageSummary).not.toHaveBeenCalled()
  })
})
