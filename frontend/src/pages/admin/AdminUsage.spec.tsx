import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent, waitFor, fireEvent, within } from '@/test-utils'
import reducer, { setAdminFilter, setAdminSearch } from '@/redux/slices/apiKeyUsage.slice'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import AdminUsage from './AdminUsage'
import { updateTenantLimits } from '@/redux/thunks/apiKeyUsage.thunks'
import type * as UsageThunks from '@/redux/thunks/apiKeyUsage.thunks'
import { getAdminUsageSummary, getAdminUsageTenants, setTenantSending } from '@/api/apiKeyUsage.api'
import type * as UsageApi from '@/api/apiKeyUsage.api'

vi.mock('@/api/apiKeyUsage.api', async (importOriginal) => ({
  ...(await importOriginal<typeof UsageApi>()),
  getAdminUsageSummary: vi.fn(),
  getAdminUsageTenants: vi.fn(),
  setTenantSending: vi.fn(),
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
  sendingEnabled: true,
  disabledReason: null,
  disabledAt: null,
  disabledBy: null,
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
  recipientsLast30Days: 3000,
  failedLast30Days: 12,
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
      disabled: 0,
    })
    vi.mocked(getAdminUsageTenants).mockResolvedValue([
      { id: 'parks', name: 'Parks Booking' },
      { id: 'roads', name: 'Roads' },
    ])
  })

  /** Opens a tenant's ⋮ menu and picks an action from it. */
  async function chooseAction(tenantName: string, action: string) {
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${tenantName}` }))
    await userEvent.click(await screen.findByRole('menuitem', { name: action }))
  }
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
  it('shows a channel with no limits as unset, with nothing to edit', async () => {
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
      recipientsLast30Days: 0,
      failedLast30Days: 0,
    }
    setup({ adminRows: [unset], adminCount: 1 })
    const tenantRow = screen.getByRole('row', { name: /Test Tenant/ })
    const cells = within(tenantRow)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
    expect(cells).toEqual([
      'Test Tenant',
      'Enabled',
      'SMS',
      'SMS: Never',
      'SMS: —No full month of sending yet',
      'SMS: 0',
      'SMS: 0 / Not set',
      'SMS: 0 / Not set',
      'SMS: Not set',
      '',
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Test Tenant' }))
    expect(await screen.findByRole('menuitem', { name: 'Disable sending' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /limits/ })).not.toBeInTheDocument()
  })
  it('shows a tenant once, with each channel on its own line in every column', () => {
    setup({ adminRows: [{ ...row, channel: 'EMAIL', usedToday: 7 }, row], adminCount: 1 })
    expect(screen.getAllByRole('row', { name: /Test Tenant/ })).toHaveLength(1)
    const tenantRow = screen.getByRole('row', { name: /Test Tenant/ })
    const daily = within(tenantRow).getAllByRole('cell')[6]
    expect(
      within(daily)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Email: 7 / 100 (7%)', 'SMS: 20 / 100 (20%)'])
  })
  it('shows when each channel last sent and its monthly average', () => {
    setup({ adminRows: [row], adminCount: 1 })
    const tenantRow = screen.getByRole('row', { name: /Test Tenant/ })
    const lastSent = within(tenantRow).getByText('3 days ago')
    expect(lastSent.tagName).toBe('TIME')
    expect(lastSent).toHaveAttribute('dateTime', row.lastSentAt)
    expect(within(tenantRow).getByText('1,240')).toBeInTheDocument()
    expect(within(tenantRow).getByText('12 (0.4%)')).toBeInTheDocument()
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
    await chooseAction('Test Tenant', 'Edit SMS limits')
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
    await chooseAction('Test Tenant', 'Edit SMS limits')
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
    await chooseAction('Test Tenant', 'Edit SMS limits')
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
    await userEvent.type(screen.getByRole('combobox', { name: 'Search tenants' }), '  Hydro ')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(setAdminSearch('Hydro'))
  })
  it('suggests matching tenants as you type and searches for the one picked', async () => {
    setup({ adminRows: [row], adminCount: 1 })
    await waitFor(() => expect(getAdminUsageTenants).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('combobox', { name: 'Search tenants' }), 'park')

    const options = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Parks Booking'])
    await userEvent.click(options[0])

    expect(mocks.dispatch).toHaveBeenCalledWith(setAdminSearch('Parks Booking'))
    expect(screen.getByRole('combobox', { name: 'Search tenants' })).toHaveValue('Parks Booking')
  })
  it('searches for the typed text on Enter when no suggestion is highlighted', async () => {
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.type(screen.getByRole('combobox', { name: 'Search tenants' }), 'oad{Enter}')
    expect(mocks.dispatch).toHaveBeenCalledWith(setAdminSearch('oad'))
  })
  it('still searches typed text when the tenant list fails to load', async () => {
    vi.mocked(getAdminUsageTenants).mockRejectedValue(new Error('down'))
    setup({ adminRows: [row], adminCount: 1 })
    await waitFor(() => expect(getAdminUsageTenants).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('combobox', { name: 'Search tenants' }), 'Parks')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(setAdminSearch('Parks'))
    expect(showErrorToast).not.toHaveBeenCalled()
  })
  it('offers to clear a search that matches no tenants', async () => {
    setup({ adminSearch: 'nothing' })
    expect(
      screen.getByRole('cell', { name: /^No results found. Try a different search./ }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(setAdminSearch(''))
    expect(screen.getByRole('combobox', { name: 'Search tenants' })).toHaveValue('')
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
  it('filters to disabled tenants from the Sending column', async () => {
    setup({ adminRows: [row], adminCount: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Column options for Sending' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Filter by/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(mocks.dispatch).toHaveBeenCalledWith(
      setAdminFilter({ field: 'status', values: ['disabled'] }),
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

  describe('sending', () => {
    const emailRow = { ...row, channel: 'EMAIL' }
    const disabledRow = {
      ...row,
      sendingEnabled: false,
      disabledReason: 'Unpaid invoice',
      disabledAt: '2026-11-01T16:00:00.000Z',
      disabledBy: 'Pat Admin',
    }

    beforeEach(() => {
      vi.mocked(setTenantSending).mockResolvedValue({ sendingEnabled: false })
    })

    it('offers each channel with limits and the sending toggle in one menu', async () => {
      setup({ adminRows: [emailRow, row], adminCount: 1 })
      await userEvent.click(screen.getByRole('button', { name: 'Actions for Test Tenant' }))
      const items = await screen.findAllByRole('menuitem')
      expect(items.map((item) => item.textContent)).toEqual([
        'Edit Email limits',
        'Edit SMS limits',
        'Disable sending',
      ])
    })

    it('marks a disabled tenant, with why, who and when on separate lines', async () => {
      setup({ adminRows: [disabledRow], adminCount: 1 })
      const sending = within(screen.getByRole('row', { name: /Test Tenant/ })).getAllByRole(
        'cell',
      )[1]
      expect(within(sending).getByText('Disabled')).toBeInTheDocument()
      expect(within(sending).getByText('Unpaid invoice')).toBeInTheDocument()
      expect(within(sending).getByText('By Pat Admin')).toBeInTheDocument()
      const when = within(sending).getByText('Nov 1, 2026')
      expect(when.tagName).toBe('TIME')
      await userEvent.click(screen.getByRole('button', { name: 'Actions for Test Tenant' }))
      expect(await screen.findByRole('menuitem', { name: 'Enable sending' })).toBeInTheDocument()
    })

    it('requires a reason to disable, then saves it and refreshes the table and summary', async () => {
      setup({ adminRows: [row], adminCount: 1 })
      await chooseAction('Test Tenant', 'Disable sending')
      const dialog = screen.getByRole('dialog', { name: 'Disable sending for Test Tenant' })

      await userEvent.click(within(dialog).getByRole('button', { name: 'Disable sending' }))
      expect(within(dialog).getByText('Enter a reason for disabling sending.')).toBeInTheDocument()
      expect(setTenantSending).not.toHaveBeenCalled()

      await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), ' Unpaid ')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Disable sending' }))

      await waitFor(() => expect(setTenantSending).toHaveBeenCalledWith('tenant', false, 'Unpaid'))
      expect(showSuccessToast).toHaveBeenCalledWith('Sending disabled for Test Tenant')
      expect(getAdminUsageSummary).toHaveBeenCalledTimes(2)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('enables with a confirmation and no reason', async () => {
      vi.mocked(setTenantSending).mockResolvedValue({ sendingEnabled: true })
      setup({ adminRows: [disabledRow], adminCount: 1 })
      await chooseAction('Test Tenant', 'Enable sending')
      const dialog = screen.getByRole('dialog', { name: 'Enable sending for Test Tenant' })

      expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enable sending' }))

      await waitFor(() => expect(setTenantSending).toHaveBeenCalledWith('tenant', true, undefined))
    })

    it('keeps the dialog open and says why when the change fails', async () => {
      vi.mocked(setTenantSending).mockRejectedValue(
        new Error('Failed to load tenant sending: down'),
      )
      setup({ adminRows: [disabledRow], adminCount: 1 })
      await chooseAction('Test Tenant', 'Enable sending')
      await userEvent.click(screen.getByRole('button', { name: 'Enable sending' }))

      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith('Failed to load tenant sending: down'),
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})
